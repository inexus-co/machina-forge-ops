import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { keepPaneReader } from "./panes";

/** How much of a terminal goes with an attachment. Roughly six screens. */
const PANE_LINES = 200;

/**
 * An SSH terminal.
 *
 * Bytes in both directions and no interpretation in between: the shell on the far end draws with
 * escape sequences and expects to be told the window size, and a terminal emulator is the thing
 * that honours both. Anything less turns `top` and `vi` into garbage.
 *
 * The emulator is created once and kept for the life of the pane. Recreating it on a re-render
 * would clear the scrollback, which is the operator's record of what they just did.
 */

export function Terminal({
  hostId,
  onData,
  onResize,
  register,
}: {
  hostId: string;
  /** What the operator typed. */
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  /** Hands back a writer, so output can be pushed in without re-rendering. */
  register: (write: (chunk: string) => void, clear: () => void) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;

    const term = new XTerm({
      convertEol: false,
      cursorBlink: true,
      fontSize: 12,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      theme: {
        background: "#0b1118",
        foreground: "#d5dee8",
        cursor: "#86b4e3",
        selectionBackground: "#24384f",
      },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);

    const resize = () => {
      try {
        fit.fit();
      } catch {
        // Fitting a pane with no size yet throws. The observer calls again when it has one.
      }
    };
    resize();
    term.onData(onData);
    term.onResize(({ cols, rows }) => onResize(cols, rows));
    register(
      (chunk) => term.write(chunk),
      () => term.reset(),
    );

    /*
     * A way to read this pane back as text.
     *
     * The last screens rather than the whole scrollback: what somebody means by "look at this" is
     * what they can see and a little of what scrolled past, and five thousand lines of a build log
     * is not context, it is the whole log.
     */
    const forget = keepPaneReader(hostId, () => {
      const buffer = term.buffer.active;
      const end = buffer.length;
      const start = Math.max(0, end - PANE_LINES);
      const lines: string[] = [];
      for (let at = start; at < end; at++) {
        lines.push(buffer.getLine(at)?.translateToString(true) ?? "");
      }
      return lines.join("\n");
    });

    /*
     * The pane is hidden and shown by CSS, so a `resize` listener on the window is not enough:
     * it changes size when a sibling appears, not only when the window does.
     */
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    return () => {
      forget();
      observer.disconnect();
      term.dispose();
    };
    // Built once per host. `onData` and friends are read through the closure at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  return <div className="remote-terminal" ref={holder} />;
}
