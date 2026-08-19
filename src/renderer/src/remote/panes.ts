/**
 * What is on each open terminal, for the conversation next to it.
 *
 * The agent runs its own commands over its own connection — it cannot see the shell the operator
 * is typing in, and it should not: that shell has no allowlist and no record. But "look at what I
 * am looking at" is most of what somebody wants to say to it, so the *text* of a terminal can be
 * handed over, deliberately, one attachment at a time.
 *
 * The emulator already holds it. Rather than teach the main process to capture panes — which
 * would only work for the tmux-backed ones — each terminal leaves a way to read its own buffer
 * here, and the composer reads it at the moment the operator presses send.
 */

const readers = new Map<string, () => string>();

/** Called by a terminal as it is created. The returned function forgets it again. */
export function keepPaneReader(key: string, read: () => string) {
  readers.set(key, read);
  return () => {
    if (readers.get(key) === read) readers.delete(key);
  };
}

/**
 * The text of one terminal, or nothing if it is not open in this window.
 *
 * Trailing blank lines are dropped, because a terminal is mostly empty space below the cursor and
 * sending two hundred blank lines as "context" is worse than sending nothing.
 */
export function readPane(key: string): string | undefined {
  const text = readers.get(key)?.();
  if (!text) return undefined;
  const lines = text.split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.length > 0 ? lines.join("\n") : undefined;
}
