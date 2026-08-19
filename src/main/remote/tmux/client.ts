import { type ChildProcess, spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Talking to tmux without a terminal.
 *
 * `tmux attach` wants a real terminal to draw into, and this application has a canvas instead. So
 * it uses tmux's control mode, which is the interface tmux offers to programs rather than to
 * people: commands in on stdin, and notifications out on stdout —
 *
 *   %output %0 hello\015\012        bytes the pane produced, non-printable ones in octal
 *   %exit                           the session ended
 *
 * That is the whole of what is needed. What tmux gives back in exchange is the reason for all of
 * this: the session belongs to the operator's machine rather than to this window, so a crash of
 * the window is not a crash of the work.
 */

const run = promisify(execFile);

/** Whether the operator's machine has tmux, and which one. Asked once and shown in the settings. */
export async function tmuxVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await run("tmux", ["-V"]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** The sessions this application started that are still alive. */
export async function listSessions(): Promise<string[]> {
  try {
    const { stdout } = await run("tmux", ["list-sessions", "-F", "#{session_name}"]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((name) => name.startsWith("machina-"));
  } catch {
    // No server running is not an error; it means nothing is being kept.
    return [];
  }
}

export async function killSession(name: string) {
  await run("tmux", ["kill-session", "-t", name]).catch(() => undefined);
}

/**
 * Bytes as control mode writes them.
 *
 * Everything outside printable ASCII arrives as a three-digit octal escape, and a real backslash
 * arrives doubled. Decoding by hand rather than with `JSON.parse` because the escapes are octal,
 * which JSON has never heard of.
 */
export function unescapeOutput(text: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\\") {
      bytes.push(...Buffer.from(text[i], "utf8"));
      continue;
    }
    const octal = text.slice(i + 1, i + 4);
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      i += 3;
      continue;
    }
    // `\\` is a backslash; anything else unrecognised is kept as it came.
    bytes.push(0x5c);
    if (text[i + 1] === "\\") i += 1;
  }
  return Buffer.from(bytes);
}

export type TmuxEvents = {
  onData(chunk: Buffer): void;
  onClosed(detail?: string): void;
};

export class TmuxSession {
  private child?: ChildProcess;
  private carry = "";
  private closed = false;
  /** Replies to commands we sent, gathered between `%begin` and `%end`. */
  private capturing?: { lines: string[]; settle: (text: string) => void };

  constructor(private readonly events: TmuxEvents) {}

  get open() {
    return Boolean(this.child) && !this.closed;
  }

  /**
   * Attach to a session, creating it around `command` if it is not there.
   *
   * One call for both because they are the same intent — "give me that terminal" — and because
   * the difference is exactly what this feature exists to hide.
   */
  start(
    name: string,
    command: string[],
    environment: Record<string, string>,
    cols: number,
    rows: number,
  ) {
    this.closed = false;
    this.carry = "";
    const child = spawn(
      "tmux",
      [
        "-C",
        "new-session",
        "-A",
        "-s",
        name,
        "-x",
        String(Math.max(20, cols)),
        "-y",
        String(Math.max(5, rows)),
        "--",
        ...command,
      ],
      {
        // Inherited plus ours: tmux passes the environment on to the program it starts.
        env: { ...process.env, ...environment },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    this.child = child;

    child.stdout?.on("data", (chunk: Buffer) => this.consume(chunk.toString("utf8")));
    let lastError = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      lastError = chunk.toString("utf8").trim();
    });
    child.on("exit", () => this.finish(lastError || undefined));
    child.on("error", (cause: Error) => this.finish(cause.message));
  }

  /** What the operator typed, as bytes. Hex because it cannot be misread as tmux syntax. */
  write(data: string) {
    const hex = [...Buffer.from(data, "utf8")].map((byte) => byte.toString(16)).join(" ");
    this.child?.stdin?.write(`send-keys -H ${hex}\n`);
  }

  resize(cols: number, rows: number) {
    this.child?.stdin?.write(
      `refresh-client -C ${Math.max(20, cols)}x${Math.max(5, rows)}\n`,
    );
  }

  /**
   * What is already on the pane, for a terminal that is being reopened.
   *
   * Control mode does not replay anything on attach — it reports what happens next. Without this
   * a recovered session comes back blank until the far end says something, which looks exactly
   * like a terminal that failed to connect.
   */
  replay() {
    return new Promise<string>((resolve) => {
      this.capturing = { lines: [], settle: resolve };
      this.child?.stdin?.write("capture-pane -p -e -J -S -2000\n");
      // A tmux that answers nothing must not leave the terminal waiting for ever.
      setTimeout(() => {
        if (this.capturing) {
          this.capturing.settle(this.capturing.lines.join("\n"));
          this.capturing = undefined;
        }
      }, 3000);
    });
  }

  stop() {
    const child = this.child;
    this.child = undefined;
    this.finish();
    // Detach, not kill: the session is the point, and it has to be there next time.
    child?.stdin?.write("detach-client\n");
    setTimeout(() => child?.kill(), 300);
  }

  private consume(text: string) {
    const lines = (this.carry + text).split("\n");
    this.carry = lines.pop() ?? "";
    for (const line of lines) this.handle(line);
  }

  private handle(line: string) {
    if (line.startsWith("%output ")) {
      const cut = line.indexOf(" ", 8);
      if (cut > 0) this.events.onData(unescapeOutput(line.slice(cut + 1)));
      return;
    }
    if (this.capturing) {
      if (line.startsWith("%end") || line.startsWith("%error")) {
        this.capturing.settle(this.capturing.lines.join("\n"));
        this.capturing = undefined;
        return;
      }
      if (!line.startsWith("%begin")) this.capturing.lines.push(line);
      return;
    }
    if (line.startsWith("%exit")) {
      // The session ended on its own — the program inside it finished.
      this.finish(line.slice(6).trim() || undefined);
    }
  }

  private finish(detail?: string) {
    if (this.closed) return;
    this.closed = true;
    this.events.onClosed(detail);
  }
}
