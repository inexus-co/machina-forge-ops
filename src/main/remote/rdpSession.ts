import { type ChildProcess, spawn } from "node:child_process";
import { t } from "../../shared/i18n";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { fileURLToPath } from "node:url";
import type { RemoteScreenEvent } from "../../shared/remote";

/**
 * One RDP screen, held by a helper process.
 *
 * The helper is a small FreeRDP client that draws nowhere: it hands back the rectangles that
 * changed and takes input. See `native/rdp/README.md` for the wire format and why it is a
 * process rather than a native addon.
 *
 * Nothing here decodes an image. The pixels arrive as BGRX32 and are passed to the renderer as
 * they are, because the only thing that should touch them is the canvas that draws them.
 */

export type RdpEvents = {
  onScreen(event: RemoteScreenEvent): void;
  /** The certificate the server showed, reported on every connection. */
  onCertificate?(fingerprint: string): void;
  /** Text copied on the far side. What the operator's own clipboard should become. */
  onClipboard?(text: string): void;
  /**
   * How the clipboard exchange is going, as the helper reports it.
   *
   * `channel` is whether it opened at all; `pulled` is the far side asking for the bytes, which
   * is the only proof that an offer landed. Both are shown to the operator, because a paste that
   * does nothing is otherwise indistinguishable from an application that does nothing.
   */
  onClipboardState?(state: { channel?: boolean; pulled?: boolean }): void;
};

export type RdpTarget = {
  host: string;
  port: number;
  username: string;
  password: string;
  /**
   * The certificate this server showed last time, or empty on a first meeting.
   *
   * Passed to the helper rather than checked here: a certificate has to be judged during the
   * handshake, before the password is sent, and by then the only thing in the conversation is
   * the helper.
   */
  expectedFingerprint?: string;
  /**
   * The address to name in messages.
   *
   * Through a bastion, `host` and `port` are a forward on this machine; what an operator needs
   * to read in a warning is the server they asked for.
   */
  displayAddress?: string;
};

/** `"S" w h`, `"R" x y w h bytes` and `"C" bytes`, in bytes including the tag. */
const SIZE_HEADER = 1 + 4 * 2;
const RECT_HEADER = 1 + 4 * 5;
const CLIP_HEADER = 1 + 4;
/** A paste is text, not a file. Anything past this is somebody's mistake, and it is dropped. */
const MOST_CLIPBOARD_BYTES = 1_000_000;

/**
 * The bytes of a view, in an `ArrayBuffer` that holds nothing else.
 *
 * Not `view.buffer`: that is the whole backing store, and a Node Buffer's store is a shared pool
 * the view sits somewhere inside. Not `view.slice()` either — on a Buffer that is `subarray`, a
 * view again.
 */
function copyOf(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

/**
 * Where the helper is.
 *
 * Packaged, it sits in the app's resources; in development it is whatever `build.sh` produced
 * for this machine. Both are looked for, so a developer never has to package to try it.
 */
export function helperPath(): string | undefined {
  const name = process.platform === "win32" ? "machina-rdp.exe" : "machina-rdp";
  const candidates = [
    path.join(process.resourcesPath ?? "", "rdp", name),
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../native/rdp/bin",
      `${process.platform}-${process.arch}`,
      name,
    ),
    path.join(
      app.getAppPath(),
      "native/rdp/bin",
      `${process.platform}-${process.arch}`,
      name,
    ),
  ];
  return candidates.find((each) => each && fs.existsSync(each));
}

/**
 * What to say when the helper is not there, to whoever is reading it.
 *
 * The two readers want opposite things. A developer running from a checkout needs the command
 * that builds it. Somebody who installed the application cannot run that command, has no
 * `native/` directory, and needs to know what still works — which is everything except the
 * screen, because the shell, the files and the agent reach the server through `ssh2` and need
 * nothing built.
 */
function missingHelper(): string {
  return app.isPackaged
    ? t("This build has no screen (RDP) viewer in it. Sessions over SSH, files and the agent all still work.")
    : t("The RDP helper has not been built. Run native/rdp/build.sh (FreeRDP 3 is required).");
}

export class RdpSession {
  private child?: ChildProcess;
  /** `ArrayBufferLike` because that is what `Buffer.concat` returns. */
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private closed = false;
  /**
   * Which session the events belong to.
   *
   * `kill` is asynchronous, so a closed helper's `exit` lands after the next one has already been
   * spawned. Without this the old process's death closes the new session: reopening a screen
   * connected, drew nothing, and reported nothing wrong.
   */
  private generation = 0;
  /**
   * The whole picture, kept up to date as the rectangles arrive.
   *
   * The renderer does not need this — it has a canvas, which is the same accumulation done by
   * something built for it. The agent does: `read_screen` has to answer with a whole desktop, and
   * it must answer whether or not anybody happens to be looking at that host's pane.
   */
  private surface?: { width: number; height: number; data: Buffer };

  constructor(private readonly events: RdpEvents) {}

  get open() {
    return Boolean(this.child) && !this.closed;
  }

  start(target: RdpTarget, width: number, height: number) {
    const helper = helperPath();
    if (!helper) {
      throw new Error(missingHelper());
    }

    this.closed = false;
    this.buffer = Buffer.alloc(0);
    const generation = ++this.generation;
    /*
     * The password is an argument, which is visible in a process listing on this machine.
     *
     * Acceptable only because this is the operator's own computer and the alternative — a pipe
     * the helper reads before connecting — is the right fix. Noted rather than hidden.
     */
    const child = spawn(
      helper,
      [
        target.host,
        String(target.port),
        target.username,
        target.password,
        String(width),
        String(height),
        target.expectedFingerprint ?? "",
      ],
      { stdio: ["pipe", "pipe", "pipe", "pipe"] },
    );
    this.child = child;

    // fd 3 carries the screen; stdout is the helper's own logging and is not parsed.
    const screen = child.stdio[3];
    if (screen && "on" in screen) {
      screen.on("data", (chunk: Buffer) => {
        if (generation === this.generation) this.consume(chunk);
      });
    }

    let lastError = "";
    /*
     * A refused certificate outranks whatever failure follows it.
     *
     * The helper reports the mismatch and *then* the connection fails, so the generic
     * `connect failed: 0x...` arrives last and would be the message on screen — a hexadecimal
     * code in place of "this is not the server you connected to before".
     */
    let certificateRefused = false;
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      // The helper's own words, not FreeRDP's log noise: those are what a person can act on.
      for (const line of text.split("\n")) {
        /*
         * The clipboard, out loud.
         *
         * Copy and paste is the one thing here that fails silently and differently on every
         * server: the channel may not open, the far side may never ask for the bytes, or the
         * exchange may be refused. Four lines in the terminal say which of those happened, and
         * they cost nothing when it works.
         */
        if (line.startsWith("clipboard")) {
          console.log(`[rdp] ${line}`);
          if (line.startsWith("clipboard channel open")) this.events.onClipboardState?.({ channel: true });
          if (line.startsWith("clipboard asked for")) this.events.onClipboardState?.({ pulled: true });
        }
        if (/^(connect failed|usage:)/.test(line) && !certificateRefused) {
          lastError = line.trim();
        }
        const changed = /^certificate changed (\S+) expected (\S+)/.exec(line);
        if (changed) {
          certificateRefused = true;
          lastError =
            t(
              "This server's certificate is not the one recorded. Either {where} was rebuilt, or it is a different server. If you rebuilt it, forget this server's key in the settings and then connect.",
              { where: target.displayAddress ?? changed[1] },
            );
          continue;
        }
        const seen = /^certificate (\S+)$/.exec(line);
        if (seen && generation === this.generation) this.events.onCertificate?.(seen[1]);
      }
    });

    child.on("exit", (code) => {
      if (generation !== this.generation) return;
      this.finish(lastError || (code === 0 ? undefined : t("The helper exited ({code})", { code: code ?? "" })));
    });
    child.on("error", (cause: Error) => {
      if (generation === this.generation) this.finish(cause.message);
    });
  }

  /** `buttons` is a bit mask: 1 left, 2 right, 4 middle. */
  mouse(x: number, y: number, buttons: number) {
    this.child?.stdin?.write(`m ${Math.round(x)} ${Math.round(y)} ${buttons}\n`);
  }

  /** One notch is 1. Positive scrolls away from the operator. */
  wheel(x: number, y: number, notches: number) {
    this.child?.stdin?.write(`w ${Math.round(x)} ${Math.round(y)} ${notches}\n`);
  }

  key(scancode: number, down: boolean) {
    this.child?.stdin?.write(`k ${scancode} ${down ? 1 : 0}\n`);
  }

  /**
   * One character, as a UTF-16 code unit.
   *
   * A scan code names a place on a US keyboard, so Japanese cannot be sent that way at all. RDP
   * carries characters on their own event, which is how a client types text the layout has no
   * key for. Whether it lands is the server's business: Windows accepts it, and the xrdp in the
   * test container advertises support and does nothing with it.
   */
  /**
   * What this machine copied, offered to the far side.
   *
   * Offered, not sent: RDP announces a format and the bytes travel when somebody pastes over
   * there. Percent-encoded because the helper reads one event per line and text has newlines in
   * it — nothing else about the encoding matters, since both ends of this pipe are ours.
   */
  clipboard(text: string) {
    if (text.length === 0 || text.length > MOST_CLIPBOARD_BYTES) return;
    this.child?.stdin?.write(`c ${encodeURIComponent(text)}\n`);
  }

  unicode(code: number) {
    this.child?.stdin?.write(`u ${code}\n`);
  }

  stop() {
    const child = this.child;
    this.child = undefined;
    // Past this point the old process's events belong to nobody.
    this.generation += 1;
    this.finish();
    child?.kill();
  }

  /**
   * Turn the byte stream into messages.
   *
   * A pipe splits wherever it likes, so a message is only complete when its declared length has
   * arrived. Anything shorter waits for the next chunk rather than being guessed at.
   */
  private consume(chunk: Buffer) {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

    for (;;) {
      if (this.buffer.length < 1) return;
      const tag = String.fromCharCode(this.buffer[0]);

      if (tag === "S") {
        if (this.buffer.length < SIZE_HEADER) return;
        const width = this.buffer.readUInt32LE(1);
        const height = this.buffer.readUInt32LE(5);
        this.buffer = this.buffer.subarray(SIZE_HEADER);
        // A resize voids everything drawn, here as well as on the canvas.
        this.surface = { width, height, data: Buffer.alloc(width * height * 4) };
        this.events.onScreen({ kind: "size", width, height });
        continue;
      }

      if (tag === "R") {
        if (this.buffer.length < RECT_HEADER) return;
        const x = this.buffer.readUInt32LE(1);
        const y = this.buffer.readUInt32LE(5);
        const width = this.buffer.readUInt32LE(9);
        const height = this.buffer.readUInt32LE(13);
        const bytes = this.buffer.readUInt32LE(17);
        if (this.buffer.length < RECT_HEADER + bytes) return;
        const pixels = this.buffer.subarray(RECT_HEADER, RECT_HEADER + bytes);
        this.buffer = this.buffer.subarray(RECT_HEADER + bytes);
        this.blit(x, y, width, height, pixels);
        this.events.onScreen({
          kind: "paint",
          rect: { x, y, width, height },
          /*
           * A real copy into a buffer of its own.
           *
           * `pixels` is a view onto the accumulating read buffer, which the next chunk reuses —
           * and `.buffer` on a view is the whole backing store, not the view. Node allocates
           * Buffers out of a shared pool, so that store begins somewhere else entirely: the
           * receiver reads from byte zero of the pool and every pixel is offset. It draws, which
           * is what makes it hard to spot — the picture arrives with its channels rotated.
           */
          pixels: copyOf(pixels),
        });
        continue;
      }

      if (tag === "C") {
        if (this.buffer.length < CLIP_HEADER) return;
        const bytes = this.buffer.readUInt32LE(1);
        if (bytes > MOST_CLIPBOARD_BYTES) {
          this.finish(t("The clipboard contents are too large."));
          return;
        }
        if (this.buffer.length < CLIP_HEADER + bytes) return;
        const text = this.buffer.toString("utf8", CLIP_HEADER, CLIP_HEADER + bytes);
        this.buffer = this.buffer.subarray(CLIP_HEADER + bytes);
        this.events.onClipboard?.(text);
        continue;
      }

      /*
       * An unknown tag means the stream is no longer where it thinks it is, and every byte after
       * it would be read as pixels. Stop rather than draw noise.
       */
      this.finish(t("The screen stream lost its place."));
      return;
    }
  }

  /**
   * Put one rectangle into the kept picture.
   *
   * Row by row, because a rectangle is contiguous in the message and scattered in the surface.
   * A rectangle that does not fit is dropped rather than clamped: it means the sender and this
   * side disagree about the size, and half-drawing it would hide that.
   */
  private blit(x: number, y: number, width: number, height: number, pixels: Buffer) {
    const surface = this.surface;
    if (!surface) return;
    if (x + width > surface.width || y + height > surface.height) return;
    if (pixels.length < width * height * 4) return;

    const stride = surface.width * 4;
    const row = width * 4;
    for (let line = 0; line < height; line++) {
      pixels.copy(surface.data, (y + line) * stride + x * 4, line * row, (line + 1) * row);
    }
  }

  /**
   * The whole desktop as it stands, in BGRA.
   *
   * The fourth byte from RDP is padding, not alpha, and it arrives as zero — a bitmap built from
   * it straight would be entirely transparent. Forced here rather than on every paint: paints
   * happen hundreds of times a second and this is asked for when somebody looks.
   */
  snapshot(): { width: number; height: number; data: Buffer } | undefined {
    const surface = this.surface;
    if (!surface || this.closed) return undefined;
    const data = Buffer.from(surface.data);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    return { width: surface.width, height: surface.height, data };
  }

  private finish(detail?: string) {
    if (this.closed) return;
    this.closed = true;
    this.surface = undefined;
    this.events.onScreen({ kind: "closed", detail });
  }
}
