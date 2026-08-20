import { type ChildProcess, spawn } from "node:child_process";
import { t } from "../../shared/i18n";

/**
 * A machine reached by running a command that hands back a shell.
 *
 * This is what `aws ssm start-session` is, and `gcloud compute ssh --tunnel-through-iap`, and
 * `az ssh vm`: the provider's own tool proves who you are with the credentials you already have
 * with them, and what comes back is a shell on the instance. **There is no SSH here** — no port
 * open on the machine, no account of ours, no key, no host key to remember. That is the whole
 * point of it, and the reason this file exists beside `sshSession.ts` rather than inside it.
 *
 * What it costs is written down where it is felt: no SFTP (see `files/session.ts`), because there
 * is no SSH subsystem to ask, and no window size, because the size travels in the SSH protocol and
 * this is not it.
 *
 * **Nothing of the provider's is stored.** The command runs on the operator's machine, as them.
 */

/** What to run. Built by the table in `shared/wayIn.ts`; nothing here knows any provider. */
export type ShellCommand = { argv: string[]; env?: Record<string, string> };

/** Long enough for a provider's handshake, short enough that a wrong id is reported. */
const READY_TIMEOUT_MS = 30_000;

/** Long enough for `apt update`, short enough that a hung command is reported. */
const DEFAULT_TIMEOUT_MS = 120_000;

/** As much output as is worth reading or sending to a model. */
const MAX_OUTPUT = 100_000;

/** How long to wait for a shell to come back after a Ctrl-C before giving up on the session. */
const RECOVER_MS = 1_500;

/** Enough of the provider tool's own complaint to explain a failure. */
const MOST_TOOL_OUTPUT = 8_000;

/**
 * The words the shell says back so this can tell one command from the next.
 *
 * Long and unlikely on purpose: they are searched for in the middle of whatever the command
 * printed, and a program that printed one of these by accident would confuse the reading.
 */
const READY = "__MACHINA_SHELL_READY__";
const END = "__MACHINA_CMD_END__";

/** Start the provider's command. Its stdio is the shell. */
export function spawnShell(command: ShellCommand): ChildProcess {
  const [program, ...rest] = command.argv;
  return spawn(program, rest, {
    stdio: ["pipe", "pipe", "pipe"],
    /* Its own group: these tools run helpers of their own (`aws` runs `session-manager-plugin`),
       and killing only the one we started leaves the helper holding the session open. */
    detached: process.platform !== "win32",
    env: command.env ? { ...process.env, ...command.env } : process.env,
  });
}

/** Stop it, and the helpers it started. */
export function killShell(child: ChildProcess) {
  if (child.pid === undefined || child.killed) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
    else child.kill();
  } catch {
    /* Already gone, or never a group. Either way there is nothing left to stop. */
    child.kill();
  }
}

/**
 * Why it would not start, in words the operator can act on.
 *
 * Only one case is named: the program is not installed, where "spawn aws ENOENT" explains nothing
 * to somebody who did not write it. Everything else is the provider's own complaint, marked as
 * theirs — an expired login, an instance with no agent, a role that says no. They know what
 * happened and this does not.
 */
export function reasonFor(program: string, output: string, cause?: Error): string {
  if (cause && (cause as NodeJS.ErrnoException).code === "ENOENT") {
    return t("{program} is not installed on this machine, or is not on the PATH.", { program });
  }
  const trimmed = output.trim();
  if (!trimmed) return cause?.message || t("It ended without saying why.");
  return t("{program} said: {said}", { program, said: trimmed });
}

/**
 * One command at a time down one shell, with what it printed and how it ended.
 *
 * SSH gives every command a channel of its own and an exit status with it. A shell gives one
 * stream and no statuses, so both have to be made:
 *
 * - **Silence first.** `stty -echo` and an empty prompt, so what comes back is what the command
 *   printed rather than what we typed and what the shell decorates it with.
 * - **A line after it.** `echo {END}$?` prints the exit status of the command before it, and
 *   finding that line is how this knows the command finished rather than merely gone quiet.
 * - **A queue.** One stream cannot carry two commands at once, so a second `run` waits.
 *
 * The extra line is ours, not the model's: what the model proposes is still one command on one
 * line and is still judged by all four layers before it reaches here.
 */
export class ShellRunner {
  private child?: ChildProcess;
  private buffer = "";
  /**
   * What the provider's own tool said, kept apart from what the shell said.
   *
   * Two pipes with no order between them: the tool's complaints arrive on stderr and the session
   * arrives on stdout, and mixing them means a warning printed at an awkward moment lands in the
   * middle of somebody's output. This half is only ever read to explain a failure.
   */
  private toolSaid = "";
  private waiting?: (chunk: string) => void;
  private queue: Promise<unknown> = Promise.resolve();
  private failure?: string;

  constructor(private readonly command: ShellCommand) {}

  private take = (chunk: Buffer) => {
    this.buffer += chunk.toString("utf8");
    this.waiting?.(this.buffer);
  };

  private takeFromTool = (chunk: Buffer) => {
    if (this.toolSaid.length < MOST_TOOL_OUTPUT) this.toolSaid += chunk.toString("utf8");
    /* A failing tool is a thing to stop waiting for, so whoever is waiting is woken. */
    this.waiting?.(this.buffer);
  };

  /** Wait until the shell has said something that answers, or give up saying why. */
  private async until(found: (text: string) => boolean, timeoutMs: number, whenLate: () => string) {
    if (found(this.buffer)) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        reject(new Error(whenLate()));
      }, timeoutMs);
      this.waiting = (text) => {
        if (!found(text)) return;
        clearTimeout(timer);
        this.waiting = undefined;
        resolve();
      };
    });
  }

  private async start(): Promise<ChildProcess> {
    if (this.child && !this.child.killed && this.failure === undefined) return this.child;
    this.stop();
    this.failure = undefined;
    this.buffer = "";
    this.toolSaid = "";

    const child = spawnShell(this.command);
    this.child = child;
    child.stdout?.on("data", this.take);
    child.stderr?.on("data", this.takeFromTool);
    /*
     * Only the shell that is still ours may report anything.
     *
     * A session thrown away after a hung command dies a moment later, and its `close` arrives
     * after the next one has already been started. Left ungated it would hand the new session the
     * old one's death, and every command after a single timeout would fail.
     */
    child.on("error", (cause: Error) => {
      if (this.child !== child) return;
      this.failure = reasonFor(this.command.argv[0] ?? "", this.lastWords(), cause);
      this.waiting?.(this.buffer);
    });
    child.on("close", () => {
      if (this.child !== child) return;
      this.child = undefined;
      /* Whatever it printed on the way out is the explanation, and often the only one there is. */
      this.failure ??= t("The shell on the other end ended: {reason}", {
        reason: reasonFor(this.command.argv[0] ?? "", this.lastWords()),
      });
      this.waiting?.(this.buffer);
    });

    /*
     * Quiet the shell, then make it say when it is ready.
     *
     * Everything printed before that word is the provider's own greeting — "Starting session with
     * SessionId: …" and a prompt — and none of it is anybody's output.
     */
    /*
     * `exec 2>&1` is the one that matters.
     *
     * A command's own stderr would otherwise come down a pipe of its own with no order between the
     * two, and a `not found` printed a moment late landed in the middle of the next command's
     * output. Merged inside the shell, everything arrives in the order it happened — which is also
     * how `CommandResult.output` has always described itself.
     */
    child.stdin?.write(`exec 2>&1; stty -echo 2>/dev/null; PS1=''; PS2=''; echo ${READY}\n`);
    await this.until(
      (text) => text.includes(READY) || this.failure !== undefined,
      READY_TIMEOUT_MS,
      () =>
        t("The way in did not open in time: {reason}", {
          reason: reasonFor(this.command.argv[0] ?? "", this.lastWords()),
        }),
    );
    if (this.failure) throw new Error(t("The way in could not be opened: {reason}", { reason: this.failure }));
    this.buffer = this.buffer.slice(this.buffer.lastIndexOf(READY) + READY.length);
    return child;
  }

  /** The most likely explanation for a failure: what the tool said, or failing that, the shell. */
  private lastWords() {
    return this.toolSaid.trim() || this.buffer;
  }

  async run(
    command: string,
    options: { timeoutMs?: number; sudoPassword?: string; maxOutputBytes?: number } = {},
  ): Promise<{ code: number; output: string; timedOut?: boolean; truncated?: boolean }> {
    /* One stream, so one at a time. Waiting on the one before is the whole of the mechanism. */
    const mine = this.queue.then(() => this.exchange(command, options));
    this.queue = mine.catch(() => undefined);
    return await mine;
  }

  private async exchange(
    command: string,
    options: { timeoutMs?: number; sudoPassword?: string; maxOutputBytes?: number },
  ) {
    const child = await this.start();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutput = options.maxOutputBytes ?? MAX_OUTPUT;
    const ending = new RegExp(`${END}(-?\\d+)`);

    this.buffer = "";
    let answered = false;
    /*
     * Answer sudo's prompt, once.
     *
     * The password is not in the command and never was. Once, because a wrong password makes sudo
     * ask twice more, and feeding it the same wrong one three times is how an account gets locked.
     */
    const watch = (text: string) => {
      if (answered || !options.sudoPassword || !/^sudo\b/.test(command)) return;
      if (!/password.*:|\[sudo\]/i.test(text)) return;
      answered = true;
      child.stdin?.write(`${options.sudoPassword}\n`);
    };

    const previous = this.waiting;
    this.waiting = (text) => {
      watch(text);
      previous?.(text);
    };

    child.stdin?.write(`${command}\necho ${END}$?\n`);

    let timedOut = false;
    try {
      await this.until((text) => ending.test(text) || this.failure !== undefined, timeoutMs, () => "");
    } catch {
      timedOut = true;
      /*
       * Getting the shell back, or giving it up.
       *
       * Ctrl-C is a byte here, not a signal: it becomes one only if there is a terminal at the far
       * end to turn it into one, which a provider's session has and a plain pipe does not. So it
       * is sent, waited on briefly, and if the shell is still busy the session is thrown away and
       * the next command opens another. A hung command must not cost the operator the machine.
       */
      child.stdin?.write("\u0003");
      const recovered = await this.until(
        (text) => ending.test(text) || this.failure !== undefined,
        RECOVER_MS,
        () => "",
      ).then(
        () => true,
        () => false,
      );
      if (!recovered) this.stop();
    }
    this.waiting = undefined;

    if (this.failure) throw new Error(this.failure);

    const found = ending.exec(this.buffer);
    const raw = found ? this.buffer.slice(0, found.index) : this.buffer;
    const truncated = raw.length > maxOutput;
    return {
      code: timedOut ? -1 : Number(found?.[1] ?? -1),
      output: clean(raw.slice(0, maxOutput), answered),
      timedOut: timedOut || undefined,
      truncated: truncated || undefined,
    };
  }

  stop() {
    if (this.child) killShell(this.child);
    this.child = undefined;
    this.waiting = undefined;
    this.buffer = "";
  }
}

/**
 * Take sudo's conversation out of the output.
 *
 * The prompt line is not part of what the command said, and the password may be echoed however
 * sudo chooses. Neither belongs in a record or in a prompt to a model.
 */
function clean(output: string, elevated: boolean) {
  const text = output.replace(/\r\n/g, "\n");
  if (!elevated) return text.trim();
  return text
    .split("\n")
    .filter((line) => !/\[sudo\]|^password.*:/i.test(line))
    .join("\n")
    .trim();
}
