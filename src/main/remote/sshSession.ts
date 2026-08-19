import type { Duplex } from "node:stream";
import { t } from "../../shared/i18n";
import { Client, type ClientChannel } from "ssh2";

/**
 * One SSH terminal.
 *
 * A real interactive shell, not `exec`: the operator is going to run `top`, answer a prompt, and
 * press Ctrl-C. Bytes go out as typed and come back as sent — nothing here interprets them, which
 * is what lets a terminal emulator on the other end behave like a terminal.
 *
 * What it reaches is a customer's server, which was already running sshd before this application
 * existed. Nothing is installed there to make this work.
 */

export type SshEvents = {
  onData(chunk: string): void;
  onClosed(detail?: string): void;
};

/**
 * What to connect with.
 *
 * A password or a private key, never both — the store keeps whichever the host was configured
 * for. The key arrives as bytes read in the main process: the path is a preference, the contents
 * are a credential, and the renderer sees neither.
 */
export type SshTarget = {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: Buffer;
  passphrase?: string;
  /**
   * Decides whether the machine that answered is the machine we meant.
   *
   * Carried on the target because the answer belongs to the address, and because every caller —
   * the terminal, the agent, the status panel, the file browser — must ask the same question.
   * A connection built without one would be the hole this closes.
   */
  verifyHostKey?: (key: Buffer, accept: (trusted: boolean) => void) => void;
  /**
   * An already-open stream to this server, when it is reached through a bastion.
   *
   * `ssh2` will use any duplex as its socket, which is exactly what a direct-tcpip channel on
   * another connection is. The handshake — and so the host key check — is still with the machine
   * at the far end, not with the bastion.
   */
  sock?: Duplex;
};

/** Long enough for a slow VPN, short enough that a wrong address is reported rather than waited on. */
const READY_TIMEOUT_MS = 20_000;

export class SshSession {
  private client?: Client;
  private channel?: ClientChannel;
  private closed = false;

  constructor(private readonly events: SshEvents) {}

  get open() {
    return Boolean(this.channel) && !this.closed;
  }

  /**
   * Connect and take a shell.
   *
   * Resolves once the shell exists, so the caller can report a bad password as a failed action
   * rather than as a terminal that silently never prints anything.
   */
  /**
   * Connect and take a shell — or attach to a tmux session, when asked.
   *
   * `tmuxSession` names one on the server. `new-session -A` attaches to it if it is there and
   * creates it if it is not, which is the same command for "start work" and "carry on with the
   * work I was doing before the connection dropped".
   */
  async start(
    target: SshTarget,
    cols: number,
    rows: number,
    tmuxSession?: string,
  ): Promise<void> {
    const client = new Client();
    this.client = client;
    this.closed = false;

    await new Promise<void>((resolve, reject) => {
      client.on("ready", () => {
        const opened = (error: Error | undefined, channel: ClientChannel | undefined) => {
          if (error || !channel) {
            reject(new Error(t("A shell could not be opened: {reason}", { reason: error?.message ?? t("reason unknown") })));
            return;
          }
          this.channel = channel;
          channel.on("data", (chunk: Buffer) => this.events.onData(chunk.toString("utf8")));
          // stderr of the shell itself, which a terminal shows inline like any other output.
          channel.stderr?.on("data", (chunk: Buffer) =>
            this.events.onData(chunk.toString("utf8")),
          );
          channel.on("close", () => this.finish());
          resolve();
        };

        if (tmuxSession) {
          /*
           * One command that works whether or not tmux is installed.
           *
           * A server without it still gets a terminal, and the operator is told once rather than
           * being handed a shell that says `tmux: command not found` and nothing else. `exec`
           * replaces the shell in both branches, so there is no extra layer to exit through.
           */
          const command =
            `command -v tmux >/dev/null 2>&1 && exec tmux new-session -A -s ${tmuxSession}` +
            ` || { echo ${JSON.stringify(t("tmux is not available; opening an ordinary shell."))}; exec "$SHELL" -l; }`;
          client.exec(command, { pty: { term: "xterm-256color", cols, rows } }, opened);
        } else {
          client.shell({ term: "xterm-256color", cols, rows }, opened);
        }
      });
      client.on("error", (cause: Error) => {
        // Before `ready` this is the connection failing; after it, a dropped link.
        if (this.channel) this.finish(cause.message);
        else reject(new Error(describe(cause)));
      });
      client.on("close", () => this.finish());
      client.connect({ ...connectionOf(target), readyTimeout: READY_TIMEOUT_MS });
    });
  }

  write(data: string) {
    this.channel?.write(data);
  }

  /**
   * Tell the far end the window changed.
   *
   * Without it `vi` and `top` draw for the size they were told at the start, and the picture goes
   * wrong the first time the operator resizes anything.
   */
  resize(cols: number, rows: number) {
    this.channel?.setWindow(rows, cols, 0, 0);
  }

  stop() {
    this.finish();
    this.client?.end();
  }

  private finish(detail?: string) {
    if (this.closed) return;
    this.closed = true;
    this.channel = undefined;
    this.events.onClosed(detail);
  }
}

/** The half of an ssh2 configuration that says who we are. Shared so both callers agree. */
export function connectionOf(target: SshTarget) {
  return {
    host: target.host,
    port: target.port,
    username: target.username,
    hostVerifier: target.verifyHostKey,
    ...(target.sock ? { sock: target.sock } : {}),
    ...(target.privateKey
      ? { privateKey: target.privateKey, passphrase: target.passphrase || undefined }
      : { password: target.password }),
  };
}

export function describe(cause: Error) {
  const message = cause.message || String(cause);
  /*
   * We refused, not the server.
   *
   * ssh2 reports a failed `hostVerifier` as a handshake failure, which reads like a network
   * fault. The reason is a decision this application made and has to own.
   */
  if (/host verification|hostverifier|verification failed/i.test(message)) {
    return t("The other end could not be verified: its key differs from the one recorded, or you answered that you do not trust it.");
  }
  if (/Cannot parse privateKey|Unsupported key format/i.test(message)) {
    return t("The key file cannot be read. Check its format, or the passphrase.");
  }
  if (/no matching|Encrypted private OpenSSH key detected/i.test(message)) {
    return t("The key needs a passphrase.");
  }
  if (/All configured authentication methods failed/i.test(message)) {
    return t("Signing in failed. Check the user name, and the password or the key.");
  }
  if (/ECONNREFUSED/.test(message)) return t("The connection was refused. Check that SSH is running.");
  if (/ETIMEDOUT|Timed out/i.test(message)) return t("No answer. Check the address and the port.");
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return t("The host name cannot be resolved.");
  return message;
}
