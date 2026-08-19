import fs from "node:fs/promises";
import path from "node:path";
import type { TypedCommand } from "../../../shared/remoteHistory";

/**
 * What was typed, kept.
 *
 * The complaint this answers: a shell's own `history` shows a fraction of what happened. Measured
 * on an ordinary Ubuntu server with two terminals open, the file holds *nothing* from either of
 * them until one ends, and each terminal's `history` shows only its own commands — bash keeps the
 * list in memory and writes it when the shell finishes. Nothing can be done about that on the far
 * end without editing a customer's shell configuration, which is not ours to do.
 *
 * What *can* be done is to keep our own record. Every byte typed into a terminal passes through
 * this process, so the commands are here to be written down whether or not the server ever
 * writes them down.
 *
 * Two things make the record readable rather than a pile of keystrokes:
 *
 * - **Line editing is applied.** Backspace, Ctrl-U and Ctrl-W are what somebody pressed, not what
 *   they meant; the line as it stood when they pressed Enter is what they meant.
 * - **Full-screen programs are skipped.** While `vi` or `top` is running the far end switches to
 *   the alternate screen, and every keystroke would otherwise be recorded as a command. The
 *   switch is visible in the output — `\\e[?1049h` in, `\\e[?1049l` out — so it is watched for.
 */

/** As long as a line may be before it is treated as a paste of something else entirely. */
const MAX_COMMAND = 4000;

type Line = {
  /** What has been typed so far, after editing. */
  text: string;
  /** Whether the far end is showing a full-screen program right now. */
  fullScreen: boolean;
  /** Inside a bracketed paste, where control bytes are content rather than editing. */
  pasting: boolean;
};

export class HistoryRecorder {
  private lines = new Map<string, Line>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly root: string) {}

  private file(hostId: string) {
    return path.join(this.root, "command-history", `${hostId}.jsonl`);
  }

  private lineFor(key: string): Line {
    const existing = this.lines.get(key);
    if (existing) return existing;
    const line: Line = { text: "", fullScreen: false, pasting: false };
    this.lines.set(key, line);
    return line;
  }

  /** What the far end said. Only read for the two sequences that say a program took the screen. */
  observe(hostId: string, sessionId: string, output: string) {
    const line = this.lineFor(`${hostId}:${sessionId}`);
    // The last switch in the chunk is the one that stands.
    const enter = output.lastIndexOf("[?1049h");
    const leave = output.lastIndexOf("[?1049l");
    if (enter >= 0 || leave >= 0) {
      line.fullScreen = enter > leave;
      if (line.fullScreen) line.text = "";
    }
  }

  /** What was typed. Returns the command when a line was completed, for anyone who wants it. */
  feed(
    hostId: string,
    sessionId: string,
    input: string,
    session?: string,
  ): TypedCommand | undefined {
    const key = `${hostId}:${sessionId}`;
    const line = this.lineFor(key);
    let finished: TypedCommand | undefined;

    for (const character of input) {
      const code = character.charCodeAt(0);

      if (line.pasting) {
        if (input.includes("[201~") && character === "~") {
          line.pasting = false;
          line.text = line.text.replace(/\[201$/, "");
          continue;
        }
        line.text += character;
        continue;
      }

      // Enter. The line as it stands is what was meant.
      if (code === 13 || code === 10) {
        const command = line.text.trim();
        line.text = "";
        if (!line.fullScreen && command && command.length <= MAX_COMMAND) {
          finished = {
            at: new Date().toISOString(),
            hostId,
            sessionId,
            ...(session ? { session } : {}),
            command,
          };
          this.write(hostId, finished);
        }
        continue;
      }
      if (code === 3 || code === 21) {
        // Ctrl-C abandons the line; Ctrl-U clears it.
        line.text = "";
        continue;
      }
      if (code === 23) {
        // Ctrl-W removes the word behind the cursor.
        line.text = line.text.replace(/\s*\S*$/, "");
        continue;
      }
      if (code === 127 || code === 8) {
        line.text = line.text.slice(0, -1);
        continue;
      }
      if (code === 27) {
        /*
         * An escape sequence — an arrow key, or the start of a paste.
         *
         * Arrows move the cursor and recall history, and following that faithfully would mean
         * writing a line editor. What is kept instead is the text as typed; a line recalled with
         * the up arrow is recorded when it is run, because the shell echoes nothing we need.
         */
        line.text += character;
        continue;
      }
      if (code < 32) continue;
      line.text += character;
      if (line.text.endsWith("[200~")) {
        line.pasting = true;
        line.text = line.text.slice(0, -6);
      }
      if (line.text.length > MAX_COMMAND * 2) line.text = "";
    }

    return finished;
  }

  /** A terminal that closed has no half-typed line worth keeping. */
  forget(hostId: string, sessionId: string) {
    this.lines.delete(`${hostId}:${sessionId}`);
  }

  /**
   * One line of JSON per command, appended.
   *
   * Appending rather than rewriting: the file is a log, two terminals write to it at once, and a
   * read-modify-write would lose whichever finished second. Writes are queued so they cannot
   * interleave halfway through a line.
   */
  private write(hostId: string, entry: TypedCommand) {
    this.queue = this.queue
      .then(async () => {
        const file = this.file(hostId);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
      })
      .catch(() => {
        // A record that cannot be written must not take the terminal down with it.
      });
  }

  /** Everything written for a host, newest last. */
  async read(hostId: string): Promise<TypedCommand[]> {
    try {
      const text = await fs.readFile(this.file(hostId), "utf8");
      return text
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as TypedCommand];
          } catch {
            // A half-written last line after a crash. The rest of the file is still good.
            return [];
          }
        });
    } catch {
      return [];
    }
  }
}
