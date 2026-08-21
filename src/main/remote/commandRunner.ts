import { Client } from "ssh2";
import { t } from "../../shared/i18n";
import { type SshTarget, connectionOf, describe } from "./sshSession";
import { ShellRunner } from "./shellHost";

/**
 * Running one command on a server and reading what it said.
 *
 * A connection of its own, never the operator's terminal. Two reasons, and the second is the one
 * that matters: a `top` left running in the interactive shell would block anything written into
 * it, and output interleaved with the operator's own work is scrollback neither can read.
 *
 * One command per channel, with an exit status. Not a shell held open — a command runs and the
 * channel closes, so there is nothing here to leave a state in.
 *
 * Two callers now: the agent, whose commands are judged first, and the status panel, whose
 * command is a fixed string in this repository. Neither is a shell handed to anybody.
 */

export type CommandResult = {
  code: number;
  /** stdout and stderr as they interleaved, which is how a person reads a terminal. */
  output: string;
  timedOut?: boolean;
  truncated?: boolean;
};

/** Long enough for `apt update`, short enough that a hung command is reported rather than waited on. */
const DEFAULT_TIMEOUT_MS = 120_000;

/** As much output as is worth reading or sending to a model. The rest is said to be missing. */
const MAX_OUTPUT = 100_000;

const READY_TIMEOUT_MS = 20_000;

export class CommandRunner {
  private client?: Client;
  private target?: SshTarget;
  /**
   * The other kind of far end: a shell handed over by the provider's own tool.
   *
   * Held here for the same reason the SSH client is — one connection reused rather than one per
   * command — and answering the same `run`, so nothing above this file knows which it got.
   */
  private shell?: ShellRunner;

  /** Connect, or say plainly why not. Called before the first command and after a drop. */
  private async connect(target: SshTarget): Promise<Client> {
    if (this.client && this.target && sameTarget(this.target, target)) return this.client;
    this.stop();

    const client = new Client();
    await new Promise<void>((resolve, reject) => {
      client.on("ready", () => resolve());
      client.on("error", (cause: Error) => reject(new Error(describe(cause))));
      client.connect({ ...connectionOf(target), readyTimeout: READY_TIMEOUT_MS });
    });
    // A dropped link must not be handed out again as if it were live.
    client.on("close", () => {
      if (this.client === client) this.client = undefined;
    });
    this.client = client;
    this.target = target;
    return client;
  }

  async run(
    target: SshTarget,
    command: string,
    options: { timeoutMs?: number; sudoPassword?: string; maxOutputBytes?: number } = {},
  ): Promise<CommandResult> {
    if (target.shell) {
      if (!this.shell || !sameTarget(this.target ?? target, target) || !this.target) {
        this.stop();
        this.shell = new ShellRunner(target.shell);
        this.target = target;
      }
      return await this.shell.run(command, options);
    }

    const client = await this.connect(target);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    /* Normally capped small so a runaway command cannot fill memory; `fetch_log` raises it on
       purpose to copy a whole log to our side (where it is analysed, not read into context). */
    const maxOutput = options.maxOutputBytes ?? MAX_OUTPUT;

    return await new Promise<CommandResult>((resolve, reject) => {
      /*
       * A pty only for `sudo`.
       *
       * sudo refuses to read a password from anything that is not a terminal, so without one an
       * elevated command hangs until the timeout with nothing printed. A pty for everything else
       * would be worse than useless: it echoes what was sent and wraps output to the terminal
       * width, so the model would read its own command back and see broken lines.
       */
      const elevated = /^sudo\b/.test(command);
      client.exec(command, { pty: elevated }, (error, channel) => {
        if (error) {
          reject(new Error(t("The command could not be started: {reason}", { reason: error.message })));
          return;
        }

        let output = "";
        let truncated = false;
        let code = -1;
        let answered = false;
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          channel.close();
          resolve({ code: -1, output: output.trim(), timedOut: true, truncated });
        }, timeoutMs);

        const take = (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          if (output.length < maxOutput) output += text;
          else truncated = true;

          /*
           * Answer sudo's prompt, once.
           *
           * The password is not in the command and never was — the model wrote `sudo`, and this
           * is the only place the real value exists. Once, because a wrong password makes sudo
           * ask twice more, and feeding it the same wrong one three times is how an account gets
           * locked.
           */
          if (elevated && !answered && options.sudoPassword && /password.*:|\[sudo\]/i.test(text)) {
            answered = true;
            channel.write(`${options.sudoPassword}\n`);
          }
        };

        channel.on("data", take);
        channel.stderr?.on("data", take);
        channel.on("close", (status: number) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            code: typeof status === "number" ? status : code,
            output: clean(output, answered),
            truncated,
          });
        });
        channel.on("exit", (status: number) => {
          if (typeof status === "number") code = status;
        });
      });
    });
  }

  stop() {
    this.client?.end();
    this.client = undefined;
    this.shell?.stop();
    this.shell = undefined;
    this.target = undefined;
  }
}

/**
 * Whether a held connection is still the one being asked for.
 *
 * The address and the account, and — where the far end is reached by running a command — the
 * command itself. Without that last part, editing the region or the profile of a provider's way in
 * leaves the connection opened with the old ones, and the operator's correction does nothing.
 */
function sameTarget(a: SshTarget, b: SshTarget) {
  return (
    a.host === b.host &&
    a.port === b.port &&
    a.username === b.username &&
    JSON.stringify(a.shell ?? null) === JSON.stringify(b.shell ?? null)
  );
}

/**
 * Take sudo's conversation out of the output.
 *
 * The prompt line is not part of what the command said, and on a pty the password is echoed as
 * whatever sudo chooses to echo. Neither belongs in a record or in a prompt to a model.
 */
function clean(output: string, elevated: boolean) {
  if (!elevated) return output.trim();
  return output
    .split("\n")
    .filter((line) => !/\[sudo\]|^password.*:/i.test(line))
    .join("\n")
    .trim();
}

