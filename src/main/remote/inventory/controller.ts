import { ipcMain } from "electron";
import { t } from "../../../shared/i18n";
import { Client } from "ssh2";
import { z } from "zod";
import type { Inventory, LogSource } from "../../../shared/remoteInventory";
import { CommandRunner } from "../commandRunner";
import { type SshTarget, connectionOf, describe } from "../sshSession";
import { killShell, spawnShell } from "../shellHost";
import { WINDOWS_INVENTORY_SCRIPT, parseWindowsInventory, powershell } from "../windows";
import { INVENTORY_COMMAND, INVENTORY_MAX_OUTPUT, parseInventory } from "./parse";
import { LOG_SOURCES_COMMAND, parseLogSources } from "./logSources";
import { Listeners } from "../listeners";

/**
 * What a server is running, and what it is writing down.
 *
 * Two different shapes over the same connection. The inventory is a question with an answer — one
 * command, one round trip, done. A log is not: it is a thing that keeps happening, and the only
 * useful way to read one during maintenance is to watch it while causing the thing you are trying
 * to explain.
 */

export type InventoryControllerDeps = {
  sshTarget(hostId: string): Promise<SshTarget>;
};

/**
 * The log sources last offered for a host, so a follow can be checked against them.
 *
 * The window names a source; this side will only build a command out of one it offered itself.
 * That check used to be against a fixed table — the table is gone, so what was offered has to be
 * remembered instead. Replaced on every `log-sources`, dropped when the host is.
 */
const offered = new Map<string, LogSource[]>();

const runners = new Map<string, CommandRunner>();
/** One follow per host: two tails of the same file into one pane would interleave nonsense. */
/**
 * The connection a log is being tailed on, whichever kind it is.
 *
 * Either an SSH client or the provider's own shell process: both are "a thing to stop", and the
 * only thing this map is ever asked to do with them is stop them.
 */
const follows = new Map<string, { end(): void }>();
/**
 * `whatis` answers per host, promise-cached so a repeated question is free and two cards asking
 * at once share one probe. A settled `undefined` means "asked, no answer" — never re-probed for
 * the life of the connection.
 */
const descriptions = new Map<string, Map<string, Promise<string | undefined>>>();
/* Every window that has asked: the main one and any floating inventory panel. */
const listeners = new Listeners();
let deps: InventoryControllerDeps;

const idSchema = z.string().min(1).max(64);

function send(channel: string, ...payload: unknown[]) {
  listeners.send(channel, ...payload);
}

function runnerFor(hostId: string) {
  const existing = runners.get(hostId);
  if (existing) return existing;
  const runner = new CommandRunner();
  runners.set(hostId, runner);
  return runner;
}

export function disposeRemoteInventory() {
  for (const runner of runners.values()) runner.stop();
  runners.clear();
  for (const client of follows.values()) client.end();
  follows.clear();
  descriptions.clear();
}

export function forgetRemoteInventory(hostId: string) {
  offered.delete(hostId);
  runners.get(hostId)?.stop();
  runners.delete(hostId);
  follows.get(hostId)?.end();
  follows.delete(hostId);
  descriptions.delete(hostId);
}

/**
 * Chunks in, whole lines out, with the operator's filter applied.
 *
 * A chunk boundary is not a line end, so the tail of one is carried into the next. Written once
 * and used by both ways in, so a log read over a shell is split exactly as one read over SSH.
 */
function takerFor(
  hostId: string,
  filter: string | undefined,
  send: (channel: string, ...args: unknown[]) => void,
) {
  let carry = "";
  return (chunk: Buffer) => {
    const text = carry + chunk.toString("utf8");
    const lines = text.split("\n");
    carry = lines.pop() ?? "";
    const wanted = filter
      ? lines.filter((line) => line.toLowerCase().includes(filter.toLowerCase()))
      : lines;
    if (wanted.length > 0) send("remote-inventory:log-lines", hostId, wanted);
  };
}

function stopFollow(hostId: string) {
  follows.get(hostId)?.end();
  follows.delete(hostId);
}

/**
 * A window that went away, with a log still being tailed.
 *
 * A renderer's cleanup does not run when its window is closed — the process is gone before the
 * effect could fire — so a `journalctl -f` started from a floating panel would go on reading a
 * customer's log into nobody's screen until the application quit.
 */
export function stopRemoteInventoryFollow(hostId: string) {
  stopFollow(hostId);
}

export function registerRemoteInventoryController(controllerDeps: InventoryControllerDeps) {
  deps = controllerDeps;

  ipcMain.handle("remote-inventory:read", async (event, rawId: unknown): Promise<Inventory> => {
    listeners.add(event.sender);
    const hostId = idSchema.parse(rawId);
    const result = await runnerFor(hostId).run(
      await deps.sshTarget(hostId),
      INVENTORY_COMMAND,
      // Long, because `apt list --upgradable` on a machine that has not been touched in a while
      // goes and thinks about it.
      { timeoutMs: 60_000, maxOutputBytes: INVENTORY_MAX_OUTPUT },
    );
    const parsed = parseInventory(result.output, { truncated: result.truncated });
    if (parsed) return parsed;

    // Not a Linux machine. Windows has shipped OpenSSH Server since 2018 and answers PowerShell.
    const windows = await runnerFor(hostId).run(
      await deps.sshTarget(hostId),
      powershell(WINDOWS_INVENTORY_SCRIPT),
      { timeoutMs: 60_000, maxOutputBytes: INVENTORY_MAX_OUTPUT },
    );
    const parsedWindows = parseWindowsInventory(windows.output);
    if (!parsedWindows) {
      /* A cut-off answer is not the same as a machine we cannot read, and saying so sends the
         operator looking for the wrong thing. Windows answers in one JSON object, so a truncated
         one fails to parse and would otherwise be reported as "not Linux and not Windows". */
      if (result.truncated || windows.truncated) {
        throw new Error(t("This server's reading was too long and stopped part way."));
      }
      throw new Error(t("This server's make-up cannot be read — it appears to be neither Linux nor Windows."));
    }
    return parsedWindows;
  });

  /**
   * What this server can actually run.
   *
   * The directories on a login shell's PATH, listed. Building a category by remembering command
   * names is guesswork twice over: the operator has to recall what exists, and then whether this
   * particular machine has it. `dnf` on a Debian box and `apt` on a RHEL one are both entries
   * that would sit in the list looking permitted and answer "not found".
   *
   * Read-only, over the connection that already exists, with nothing installed on the far end.
   */
  ipcMain.handle("remote-inventory:commands", async (event, rawId: unknown): Promise<string[]> => {
    listeners.add(event.sender);
    const hostId = idSchema.parse(rawId);
    const result = await runnerFor(hostId).run(
      await deps.sshTarget(hostId),
      /*
       * `ls` of the bin directories rather than `compgen -c`.
       *
       * `compgen` is a bash builtin and needs a login shell to mean anything; the directories are
       * there whatever the shell is. Aliases and functions are missed, which is correct — the
       * agent sends one command, not a shell that would expand them.
       */
      "for d in /usr/local/sbin /usr/local/bin /usr/sbin /usr/bin /sbin /bin; do " +
        '[ -d "$d" ] && ls -1 "$d" 2>/dev/null; done | sort -u',
      { timeoutMs: 30_000 },
    );
    const names = result.output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[a-z0-9._+-]+$/i.test(line));
    if (names.length > 0) return [...new Set(names)].slice(0, 5000);

    /* Windows keeps its programs elsewhere and answers PowerShell. */
    const windows = await runnerFor(hostId).run(
      await deps.sshTarget(hostId),
      powershell(
        "Get-Command -CommandType Application | " +
          "ForEach-Object { $_.Name -replace '\\.(exe|com|bat|cmd)$','' } | Sort-Object -Unique",
      ),
      { timeoutMs: 30_000 },
    );
    return [
      ...new Set(
        windows.output
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => /^[a-z0-9._+-]+$/i.test(line)),
      ),
    ].slice(0, 5000);
  });

  /*
   * One line about a command the catalog does not know, from the server's own manuals.
   *
   * Judgement material for the approval card, fetched after the card is already on screen — the
   * card never waits on this, and an empty answer leaves its slot showing "—". The program name
   * is validated to bare-name characters before it is interpolated, which is what makes the
   * interpolation safe: no quotes, spaces or `$` can arrive here.
   */
  ipcMain.handle(
    "remote-inventory:describe-command",
    async (event, rawId: unknown, rawProgram: unknown): Promise<string | undefined> => {
      listeners.add(event.sender);
      const hostId = idSchema.parse(rawId);
      const program = z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9._+-]+$/i)
        .parse(rawProgram);
      const key = program.toLowerCase();
      let perHost = descriptions.get(hostId);
      if (!perHost) {
        perHost = new Map();
        descriptions.set(hostId, perHost);
      }
      const cached = perHost.get(key);
      if (cached) return await cached;
      const probe = (async () => {
        try {
          const linux = await runnerFor(hostId).run(
            await deps.sshTarget(hostId),
            `whatis -l ${program}`,
            { timeoutMs: 8_000 },
          );
          const line = linux.output
            .split("\n")
            .map((each) => each.trim())
            .find((each) => each.includes(" - "));
          if (line) return line.split(" - ").slice(1).join(" - ").trim() || undefined;
          /* Windows answers PowerShell; a cmdlet's synopsis is its one line. */
          const windows = await runnerFor(hostId).run(
            await deps.sshTarget(hostId),
            powershell(`(Get-Help ${program} -ErrorAction SilentlyContinue).Synopsis`),
            { timeoutMs: 8_000 },
          );
          const synopsis = windows.output.trim().split("\n")[0]?.trim();
          return synopsis || undefined;
        } catch {
          return undefined;
        }
      })();
      perHost.set(key, probe);
      return await probe;
    },
  );

  /**
   * The logs this server actually has.
   *
   * Found rather than assumed: offering an nginx error log on a machine with no nginx is an entry
   * that answers "file not found" when somebody clicks it, which reads as a broken tool rather
   * than as an absent web server.
   */
  ipcMain.handle("remote-inventory:log-sources", async (event, rawId: unknown) => {
    listeners.add(event.sender);
    const hostId = idSchema.parse(rawId);
    const result = await runnerFor(hostId).run(await deps.sshTarget(hostId), LOG_SOURCES_COMMAND, {
      timeoutMs: 20_000,
    });
    const sources = parseLogSources(result.output);
    offered.set(hostId, sources);
    return sources;
  });

  /**
   * Follow one, live.
   *
   * `journalctl -f` and `tail -F` both start with the recent past and then keep going, which is
   * what somebody watching a log while restarting a service needs: the lines from before the
   * restart are the ones that say why it was restarted.
   *
   * The filter is applied on this side. It is a plain substring, not a pattern sent to the far
   * end — a filter that travelled would have to be quoted into a shell command, and this is not
   * a place to be building shell commands out of what somebody typed.
   */
  ipcMain.handle(
    "remote-inventory:follow-log",
    async (event, rawId: unknown, rawSource: unknown, rawFilter: unknown) => {
      listeners.add(event.sender);
      const hostId = idSchema.parse(rawId);
      const source = z
        .object({
          id: z.string().max(300),
          label: z.string().max(120),
          kind: z.enum(["journal", "file"]),
          path: z.string().max(300).optional(),
        })
        .parse(rawSource);
      const filter = z.string().max(200).optional().parse(rawFilter ?? undefined);

      stopFollow(hostId);
      const target = await deps.sshTarget(hostId);

      /*
       * The path is checked against the list this application offered.
       *
       * The renderer names a source, and a name that did not come from `log-sources` is not one
       * this side will build a command out of.
       */
      const known = (offered.get(hostId) ?? []).find((each) => each.id === source.id);
      if (!known) throw new Error(t("That log cannot be opened."));
      let command: string;
      if (known.kind === "journal") {
        /* One unit, or the whole machine. Either way no path is involved, which is why this is
           the only reading that works the same on every distribution. */
        command = known.unit
          ? `journalctl -u ${known.unit} -n 300 -f --no-pager`
          : "journalctl -n 300 -f --no-pager";
      } else {
        command = `tail -n 300 -F ${known.path}`;
      }

      /*
       * Reading lines as they arrive, whichever way in this server has.
       *
       * Over SSH that is a channel of its own. Over a shell handed back by a provider's tool it is
       * a shell of its own — the same reason either way: a `-f` never ends, and sharing it with
       * anything else would block whatever the other thing wanted to do.
       */
      const take = takerFor(hostId, filter, send);
      if (target.shell) {
        const child = spawnShell(target.shell);
        follows.set(hostId, { end: () => killShell(child) });
        child.stdout?.on("data", take);
        child.stderr?.on("data", take);
        child.on("close", () => {
          send("remote-inventory:log-closed", hostId, undefined);
          stopFollow(hostId);
        });
        child.stdin?.write(`${command}\n`);
        return;
      }

      const client = new Client();
      follows.set(hostId, client);
      await new Promise<void>((resolve, reject) => {
        client.on("ready", () => {
          client.exec(command, { pty: false }, (error, channel) => {
            if (error) {
              reject(new Error(t("The log cannot be opened: {reason}", { reason: error.message })));
              return;
            }
            channel.on("data", take);
            channel.stderr?.on("data", take);
            channel.on("close", () => {
              send("remote-inventory:log-closed", hostId, undefined);
              stopFollow(hostId);
            });
            resolve();
          });
        });
        client.on("error", (cause: Error) => reject(new Error(describe(cause))));
        client.connect({ ...connectionOf(target), readyTimeout: 20_000 });
      });
    },
  );

  ipcMain.handle("remote-inventory:stop-log", (_event, rawId: unknown) => {
    stopFollow(idSchema.parse(rawId));
  });
}
