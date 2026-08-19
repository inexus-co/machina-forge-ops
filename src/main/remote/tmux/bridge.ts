import { Client, type ClientChannel } from "ssh2";
import { t } from "../../../shared/i18n";
import { createHash } from "node:crypto";
import fs from "node:fs";
import type { Duplex } from "node:stream";

/**
 * One SSH terminal, held by a process that outlives the window.
 *
 * This runs *inside* a tmux session on the operator's own machine — tmux supervises it, keeps its
 * output, and is still there when Forge is not. If Forge crashes, this process is still connected
 * and whatever was running on the server is still running; reopening Forge attaches to the same
 * tmux session and the terminal comes back with its scrollback.
 *
 * What it is not: `ssh`. The connection is made with the same library and the same rules as the
 * rest of the application — the host key must match the fingerprint this process was told to
 * expect, the key or password comes from the application's own store, and a bastion is a channel
 * on another connection. Handing the job to the system `ssh` would have been less code and two
 * separate sets of rules about who a server is.
 *
 * Started as a plain Node process (`ELECTRON_RUN_AS_NODE`), so no Chromium is loaded for a
 * terminal. Everything it needs arrives in the environment:
 *
 *   MACHINA_SSH   JSON: host, port, username, auth, keyPath, fingerprint, and the jump host
 *   MACHINA_PASS  the password or passphrase, when there is one
 *
 * The credential is in this process's environment rather than on its command line. Both are
 * readable by the operator's own account and nobody else's, which is the same boundary the
 * application already lives inside; a command line is additionally visible in `ps` to anyone
 * sharing the machine, which is why it is not that.
 */

type Plan = {
  host: string;
  port: number;
  username: string;
  auth: "password" | "key";
  keyPath?: string;
  /** `SHA256:…`, as recorded when somebody first agreed to this server. */
  fingerprint: string;
  jump?: {
    host: string;
    port: number;
    username: string;
    auth: "password" | "key";
    keyPath?: string;
    fingerprint: string;
  };
};

const say = (text: string) => process.stdout.write(`${text}\r\n`);

function fingerprintOf(key: Buffer) {
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

/**
 * The connection settings, with the host key check this application already uses.
 *
 * The expected fingerprint is passed in rather than looked up: which servers have been agreed to
 * is the application's memory, and a second copy of that list here would be a second answer to
 * the same question.
 */
function connection(plan: Plan, secret: string | undefined) {
  return {
    host: plan.host,
    port: plan.port,
    username: plan.username,
    ...(plan.auth === "key" && plan.keyPath
      ? { privateKey: fs.readFileSync(plan.keyPath), passphrase: secret || undefined }
      : { password: secret }),
    hostVerifier: (key: Buffer, accept: (trusted: boolean) => void) => {
      const found = fingerprintOf(key);
      if (found === plan.fingerprint) {
        accept(true);
        return;
      }
      say(
        `[31m${t("The key at the other end differs. Expected {expected} / found {found}", {
          expected: plan.fingerprint,
          found,
        })}[0m`,
      );
      accept(false);
    },
    readyTimeout: 20_000,
  };
}

async function main() {
  const plan: Plan = JSON.parse(process.env.MACHINA_SSH ?? "{}");
  const secret = process.env.MACHINA_PASS;
  if (!plan.host) {
    say(t("Nothing to connect to was handed over."));
    process.exit(2);
  }

  say(
    `[2m${t("Connecting to {where}…", { where: `${plan.username}@${plan.host}:${plan.port}` })}[0m`,
  );

  /*
   * Through a bastion, when there is one.
   *
   * The same shape as the application's own: a channel opened on the bastion becomes the socket
   * of the connection to the server, so the handshake — and the host key check above — is with
   * the machine at the far end.
   */
  let sock: Duplex | undefined;
  if (plan.jump) {
    const bastion = new Client();
    await new Promise<void>((resolve, reject) => {
      bastion.on("ready", () => resolve());
      bastion.on("error", reject);
      bastion.connect(connection(plan.jump as Plan, process.env.MACHINA_JUMP_PASS));
    });
    sock = await new Promise((resolve, reject) => {
      bastion.forwardOut("127.0.0.1", 0, plan.host, plan.port, (error, stream) =>
        error ? reject(error) : resolve(stream),
      );
    });
  }

  const client = new Client();
  client.on("ready", () => {
    /*
     * The size comes from tmux, which owns the terminal this process is attached to.
     *
     * `columns` is undefined when stdout is not a terminal, which happens only if somebody runs
     * this by hand outside tmux — a sensible default is better than refusing.
     */
    const cols = process.stdout.columns ?? 120;
    const rows = process.stdout.rows ?? 30;

    const opened = (error: Error | undefined, channel: ClientChannel | undefined) => {
      if (error || !channel) {
        say(
          `[31m${t("A shell could not be opened: {reason}", { reason: error?.message ?? t("reason unknown") })}[0m`,
        );
        process.exit(1);
        return;
      }
      channel.on("data", (chunk: Buffer) => process.stdout.write(chunk));
      channel.stderr?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
      process.stdin.setRawMode?.(true);
      process.stdin.on("data", (chunk: Buffer) => channel.write(chunk));
      // tmux resizes the pane; the far end has to be told, or `vi` draws for the old size.
      process.stdout.on("resize", () =>
        channel.setWindow(process.stdout.rows ?? rows, process.stdout.columns ?? cols, 0, 0),
      );
      channel.on("close", () => {
        say(`[2m${t("— The connection has ended. You can close this window.")}[0m`);
        process.exit(0);
      });
    };

    /*
     * The server's own tmux, when that is asked for as well.
     *
     * The two are independent and cover different losses: that one survives the network going
     * away, the tmux around *this process* survives Forge going away.
     */
    const serverTmux = process.env.MACHINA_SERVER_TMUX;
    if (serverTmux) {
      const command =
        `command -v tmux >/dev/null 2>&1 && exec tmux new-session -A -s ${serverTmux}` +
        ` || { echo ${JSON.stringify(t("tmux is not available; opening an ordinary shell."))}; exec "$SHELL" -l; }`;
      client.exec(command, { pty: { term: "xterm-256color", cols, rows } }, opened);
    } else {
      client.shell({ term: "xterm-256color", cols, rows }, opened);
    }
  });
  client.on("error", (cause: Error) => {
    say(`[31m${cause.message}[0m`);
    /*
     * Stay open on failure.
     *
     * A process that exits takes its tmux window with it, and the message explaining why the
     * connection failed goes with it — leaving a terminal that closed itself for no visible
     * reason. Waiting for a keystroke lets somebody read it.
     */
    process.stdin.setRawMode?.(true);
    process.stdin.once("data", () => process.exit(1));
  });

  client.connect({ ...connection(plan, secret), ...(sock ? { sock } : {}) });
}

void main();
