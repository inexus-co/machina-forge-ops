import type { Duplex } from "node:stream";
import { t } from "../../shared/i18n";
import { Client, type ClientChannel } from "ssh2";
import { type ShellCommand, killShell, reasonFor, spawnShell } from "./shellHost";

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
  /**
   * When this machine is reached by asking its provider for a shell rather than by SSH.
   *
   * Set, it replaces everything above it: the command is run on this machine and its stdio *is*
   * the shell (`shellHost.ts`). No port is opened on the far end, no account of ours is used, and
   * there is no host key, because there is no SSH. What is given up is SFTP.
   */
  shell?: ShellCommand;
};

/** Long enough for a slow VPN, short enough that a wrong address is reported rather than waited on. */
const READY_TIMEOUT_MS = 20_000;

export class SshSession {
  private client?: Client;
  private channel?: ClientChannel;
  /** The provider's own process, when the shell came from a command rather than from SSH. */
  private child?: ReturnType<typeof spawnShell>;
  private closed = false;

  constructor(private readonly events: SshEvents) {}

  get open() {
    return Boolean(this.channel ?? this.child) && !this.closed;
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
    this.closed = false;
    if (target.shell) {
      this.fromCommand(target.shell, tmuxSession);
      return;
    }

    const client = new Client();
    this.client = client;

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

  /**
   * The shell the provider handed back, as the terminal.
   *
   * Nothing is waited for: the tool prints its own greeting before the shell appears, and refusing
   * to show the terminal until then would hide exactly the line that says what went wrong. What
   * comes out — greeting, shell, error — goes to the screen as it arrives, which is what a
   * terminal is for.
   */
  private fromCommand(shell: ShellCommand, tmuxSession?: string) {
    const child = spawnShell(shell);
    this.child = child;
    let said = "";
    const relay = (chunk: Buffer) => {
      /*
       * A terminal needs the carriage return as well as the line feed.
       *
       * Over SSH the far end is a terminal and sends both. A shell handed over on a pipe sends
       * only the line feed, and a terminal emulator given that moves down without moving back —
       * output comes out as a staircase. Providers whose session has a terminal at the far end
       * already send both, and this leaves those alone.
       */
      const text = chunk.toString("utf8").replace(/\r?\n/g, "\r\n");
      if (said.length < 4000) said += text;
      this.events.onData(text);
    };
    child.stdout?.on("data", relay);
    child.stderr?.on("data", relay);
    child.on("error", (cause: Error) =>
      this.finish(reasonFor(shell.argv[0] ?? "", said, cause)),
    );
    child.on("close", () => this.finish());

    /*
     * The server's own tmux, when it was asked for.
     *
     * Written into the shell rather than asked for at the protocol level, because there is no
     * protocol here — the same one line as over SSH, and the same fallback when tmux is missing.
     */
    if (tmuxSession) {
      child.stdin?.write(
        `command -v tmux >/dev/null 2>&1 && exec tmux new-session -A -s ${tmuxSession}` +
          ` || echo ${JSON.stringify(t("tmux is not available; opening an ordinary shell."))}\n`,
      );
    }
  }

  write(data: string) {
    if (this.child) {
      this.child.stdin?.write(data);
      return;
    }
    this.channel?.write(data);
  }

  /**
   * Tell the far end the window changed.
   *
   * Without it `vi` and `top` draw for the size they were told at the start, and the picture goes
   * wrong the first time the operator resizes anything.
   */
  resize(cols: number, rows: number) {
    /*
     * Only SSH can be told.
     *
     * The size travels in the SSH protocol, and a shell handed over by a provider's tool has no
     * protocol to carry it — the far end keeps whatever size it decided on when the session
     * opened. Full-screen programs will draw for that size. Said here rather than pretended away.
     */
    this.channel?.setWindow(rows, cols, 0, 0);
  }

  stop() {
    this.finish();
    this.client?.end();
    if (this.child) killShell(this.child);
  }

  private finish(detail?: string) {
    if (this.closed) return;
    this.closed = true;
    this.channel = undefined;
    this.child = undefined;
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
