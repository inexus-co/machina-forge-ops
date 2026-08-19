import { useCallback, useEffect, useRef } from "react";
import type { RemoteScreenEvent } from "../../../shared/remote";
import { scancodeOf } from "../../../shared/scancodes";

/**
 * The remote desktop, drawn on a canvas.
 *
 * Paints arrive as rectangles of BGRX32 — RDP is an update protocol and the helper passes that
 * through — so this draws each one where it belongs and never repaints the rest. The bitmap stays
 * the surface's own size and only the box it is drawn into is scaled, so one buffer pixel is one
 * remote pixel and the browser does the resampling it is good at.
 *
 * Clicks are converted back to surface coordinates before they are sent, because the far end
 * knows nothing about how large the operator's window happens to be.
 */

/**
 * How much scrolling makes one notch of a wheel.
 *
 * A mouse reports about this much per click of its wheel; a trackpad reports a stream of small
 * amounts, which is why the remainder is carried rather than rounded away — otherwise a slow
 * two-finger drag scrolls nothing at all.
 */
const PIXELS_PER_NOTCH = 100;

export function RemoteScreen({
  hostId,
  onKey,
  onMouse,
  onWheel,
  register,
  registerCanvas,
  repaint,
}: {
  hostId: string;
  /** Ask the main process for the whole surface again — RDP or VNC, whichever this host is. */
  repaint: () => void;
  onMouse: (x: number, y: number, buttons: number) => void;
  /** One notch is 1. Positive scrolls away from the operator. */
  onWheel: (x: number, y: number, notches: number) => void;
  onKey: (scancode: number, down: boolean) => void;
  /** Hands back the painter, so frames arrive without a re-render. */
  register: (paint: (event: RemoteScreenEvent) => void) => void;
  /**
   * The canvas itself, for whoever wants to read the picture rather than draw on it.
   *
   * The recording copies from it. Handed over rather than reached for with a query selector,
   * because there is one of these per host and they are all mounted at once.
   */
  registerCanvas?: (node: HTMLCanvasElement | undefined) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  /**
   * The newest position not yet sent, and the frame that will send it.
   *
   * A pointer is a place, not a path. `pointermove` fires as often as the display refreshes and
   * sometimes faster, and forwarding every one of them put more events on the wire than the far
   * end could act on — the pointer arrived where the hand had been, not where it was. One
   * position per frame is as often as anything can be drawn anyway.
   *
   * Presses and releases do not go through here. They are transitions, they carry their own
   * coordinates, and they are sent the moment they happen.
   */
  const pendingMove = useRef<{ x: number; y: number; buttons: number }>(undefined);
  const moveFrame = useRef<number>(undefined);
  /** Wheel deltas are pixels; RDP counts notches. This is the remainder between them. */
  const wheelDebt = useRef(0);


  /**
   * Size the picture to its box, keeping the surface's proportions.
   *
   * Measured rather than left to CSS. A percentage `max-height` needs a definite containing
   * block, and inside a centred grid area it does not resolve — every combination of
   * `max-width` / `max-height` / `aspect-ratio` left the canvas at its intrinsic 800px in a
   * 480px box, and `overflow: hidden` cut the bottom off the desktop. Two numbers and a
   * division cannot be ambiguous.
   */
  const fit = useCallback(() => {
    const node = canvas.current;
    const box = node?.parentElement?.getBoundingClientRect();
    if (!node || !box || box.width === 0 || box.height === 0) return;
    const scale = Math.min(box.width / node.width, box.height / node.height);
    node.style.width = `${Math.floor(node.width * scale)}px`;
    node.style.height = `${Math.floor(node.height * scale)}px`;
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    context.current = element.getContext("2d", { alpha: false });

    // The box changes when the window resizes, when the split changes, and when a half goes
    // fullscreen. All three are the parent changing size, so one observer covers them.
    const observer = new ResizeObserver(fit);
    if (element.parentElement) observer.observe(element.parentElement);

    /*
     * Whatever is on that desktop now, not only what changes next.
     *
     * This canvas is new — the window was just opened, or reloaded — and the connection it is
     * showing may have been up for an hour. Without this the picture stays as it was created,
     * empty, until something over there moves; on a machine sitting at a login prompt, that is
     * never. The main process has kept the whole surface since the first frame.
     */
    repaint();

    registerCanvas?.(element);
    register((event) => {
      const ctx = context.current;
      const node = canvas.current;
      if (!ctx || !node) return;

      if (event.kind === "size") {
        node.width = event.width;
        node.height = event.height;
        ctx.fillStyle = "#0b1118";
        ctx.fillRect(0, 0, event.width, event.height);
        fit();
        return;
      }
      /*
       * A closed session leaves nothing behind.
       *
       * The last frame is a picture of a machine this window is no longer attached to; keeping it
       * up says the opposite of what happened. Cleared here rather than by unmounting, so the
       * canvas and its size survive for the next connection.
       */
      if (event.kind === "closed") {
        ctx.fillStyle = "#0b1118";
        ctx.fillRect(0, 0, node.width, node.height);
        return;
      }
      if (event.kind !== "paint") return;

      const { x, y, width, height } = event.rect;
      /*
       * BGRX to RGBA, in the buffer it arrived in.
       *
       * The fourth byte is padding, not alpha — copied through it gives a fully transparent image
       * and a black screen. Done a word at a time rather than a byte at a time, and in place: a
       * full-screen rectangle from a Retina desktop is nineteen megabytes, and allocating a second
       * one for every frame cost more in collection than the conversion did. The buffer came
       * across the process boundary, so nobody else is holding it.
       */
      const words = new Uint32Array(event.pixels);
      for (let i = 0, n = width * height; i < n; i++) {
        const pixel = words[i];
        words[i] =
          0xff000000 | ((pixel & 0xff) << 16) | (pixel & 0xff00) | ((pixel >>> 16) & 0xff);
      }
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(event.pixels), width, height),
        x,
        y,
      );
    });

    /*
     * The wheel, listened for directly so it can be swallowed.
     *
     * React registers `wheel` on the root as a passive listener, and a passive listener may not
     * call `preventDefault` — through `onWheel` the scroll would reach the remote screen *and*
     * scroll the panel it sits in.
     */
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const at = positionOf(event);
      if (!at) return;
      // `deltaMode` says what the number counts: pixels, lines, or pages.
      const pixels =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * 400
            : event.deltaY;
      wheelDebt.current += pixels;
      const notches = Math.trunc(wheelDebt.current / PIXELS_PER_NOTCH);
      if (notches === 0) return;
      wheelDebt.current -= notches * PIXELS_PER_NOTCH;
      // Down the page is towards the operator, which RDP counts as negative.
      onWheel(at.x, at.y, -notches);
    };
    element.addEventListener("wheel", wheel, { passive: false });

    return () => {
      registerCanvas?.(undefined);
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
      if (moveFrame.current !== undefined) cancelAnimationFrame(moveFrame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  /** Where on the remote surface a pointer event landed. */
  const positionOf = useCallback((event: { clientX: number; clientY: number }) => {
    const node = canvas.current;
    if (!node) return undefined;
    const box = node.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return undefined;
    return {
      x: Math.round(((event.clientX - box.left) / box.width) * node.width),
      y: Math.round(((event.clientY - box.top) / box.height) * node.height),
    };
  }, []);

  /** RDP's button mask: 1 left, 2 right, 4 middle — the same order the browser reports. */
  const maskOf = (buttons: number) =>
    (buttons & 1 ? 1 : 0) | (buttons & 2 ? 2 : 0) | (buttons & 4 ? 4 : 0);

  /** Send a press or a release now, and drop any move queued in front of it. */
  const transition = useCallback(
    (at: { x: number; y: number }, buttons: number) => {
      if (moveFrame.current !== undefined) cancelAnimationFrame(moveFrame.current);
      moveFrame.current = undefined;
      pendingMove.current = undefined;
      onMouse(at.x, at.y, buttons);
    },
    [onMouse],
  );

  /** Remember where the pointer is; the next frame sends it. */
  const queueMove = useCallback(
    (at: { x: number; y: number }, buttons: number) => {
      pendingMove.current = { ...at, buttons };
      if (moveFrame.current !== undefined) return;
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = undefined;
        const move = pendingMove.current;
        pendingMove.current = undefined;
        if (move) onMouse(move.x, move.y, move.buttons);
      });
    },
    [onMouse],
  );

  return (
    <canvas
      className="remote-screen"
      ref={canvas}
      tabIndex={0}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        // Focus first: the keyboard follows the picture, the way it does in any remote client.
        event.currentTarget.focus();
        /*
         * Follow this pointer until it is released, wherever it goes.
         *
         * A drag that leaves the canvas otherwise stops reporting, the release is delivered to
         * whatever is underneath, and the far end is left holding a button nobody is pressing.
         */
        event.currentTarget.setPointerCapture(event.pointerId);
        const at = positionOf(event);
        if (at) transition(at, maskOf(event.buttons));
      }}
      onPointerMove={(event) => {
        const at = positionOf(event);
        if (at) queueMove(at, maskOf(event.buttons));
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        const at = positionOf(event);
        if (at) transition(at, maskOf(event.buttons));
      }}
      /* A cancelled pointer — a gesture the browser took over — is still a release to the far
         end, which would otherwise keep the button down for good. */
      onPointerCancel={(event) => {
        const at = positionOf(event);
        if (at) transition(at, 0);
      }}
      onKeyDown={(event) => {
        const code = scancodeOf(event.nativeEvent.code);
        if (code === undefined) return;
        event.preventDefault();
        onKey(code, true);
      }}
      onKeyUp={(event) => {
        const code = scancodeOf(event.nativeEvent.code);
        if (code === undefined) return;
        event.preventDefault();
        onKey(code, false);
      }}
    />
  );
}

/**
 * A browser `KeyboardEvent.code` as a PC/XT scancode, which is what RDP carries.
 *
 * `code` is the physical key and not the character it produces, which is exactly the right level:
 * the layout is the remote machine's business, and translating characters here would fight it.
 * The table is the common set; anything absent is dropped rather than guessed at, because a wrong
 * scancode is a keystroke the operator did not make.
 */
