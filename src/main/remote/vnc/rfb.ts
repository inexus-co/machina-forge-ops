import zlib from "node:zlib";
import { t } from "../../../shared/i18n";
import type { RemoteScreenEvent } from "../../../shared/remote";
import { type ArdChallenge, ardResponse } from "./ard";
import { desEncryptBlock } from "./des";
import { msLogonResponse } from "./mslogon";
import { decodeZrle } from "./zrle";
import {
  SEC_ARD,
  SEC_MSLOGON_II,
  SEC_NONE,
  SEC_VENCRYPT,
  SEC_VNC_AUTH,
  type VncCredentials,
  chooseSecurity,
  chooseSubtype,
  innerOf,
  plainMessage,
  tlsOf,
} from "./security";

/**
 * A VNC (RFB 3.8) client, as the protocol without the socket.
 *
 * RDP is a native helper because FreeRDP is; RFB is small enough to speak here. This holds no
 * socket of its own — bytes come in through `receive()` and go out through the `send` callback the
 * session hands it — so the whole handshake and frame loop can be driven from a test with two
 * buffers and no network.
 *
 * The pixels are normalized to the one shape the rest of the app already draws: BGRX32, the same
 * as the RDP helper emits (`RemoteScreenEvent`). We ask the server for exactly that format at
 * connect time (`PIXEL_FORMAT_BGRX`), so a Raw rectangle is already in the right order and nothing
 * downstream needs to know it came from VNC.
 */

/** Client→server message types. */
const CLIENT_SET_PIXEL_FORMAT = 0;
const CLIENT_SET_ENCODINGS = 2;
const CLIENT_FB_UPDATE_REQUEST = 3;
const CLIENT_KEY_EVENT = 4;
const CLIENT_POINTER_EVENT = 5;
const CLIENT_CUT_TEXT = 6;

/** Server→client message types. */
const SERVER_FB_UPDATE = 0;
const SERVER_SET_COLOUR_MAP = 1;
const SERVER_BELL = 2;
const SERVER_CUT_TEXT = 3;

/** Encodings we understand, plus the resize pseudo-encoding. */
const ENC_RAW = 0;
const ENC_COPY_RECT = 1;
const ENC_ZRLE = 16;
const ENC_DESKTOP_SIZE = -223;

/** A paste is text; anything past this is a mistake and is dropped. */
const MOST_CUT_BYTES = 1_000_000;

/**
 * Ceilings, because every length on this wire is the server's to declare.
 *
 * A framebuffer is `width * height * 4` bytes and both sides arrive as 16-bit numbers, so a
 * server that says 65535×65535 asks this process for 17GB — which Node will attempt, freezing
 * every window in the application while it zeroes it. The side limit is the one the RDP path
 * already applies to a desktop (`remote:rdp-open` takes at most 4096), and the buffer limit is a
 * little above one full frame at that size.
 */
const MOST_SIDE = 4096;
const MOST_BUFFER_BYTES = 96 * 1024 * 1024;
/** A refusal or a desktop name is a sentence, not a payload. */
const MOST_TEXT_BYTES = 4096;

export type RfbEvents = {
  onScreen(event: RemoteScreenEvent): void;
  onClipboard?(text: string): void;
  /** The connection is up and the desktop size is known. */
  onReady?(info: { width: number; height: number; name: string }): void;
  /** The far side or the protocol ended it, with a reason to show. */
  onError?(detail: string): void;
  /**
   * Everything from here is inside TLS — asked of whoever owns the socket.
   *
   * The client holds no socket of its own, so it cannot wrap one. It stops parsing, asks, and
   * waits for `secured()`. `x509` says whether the server will present a certificate worth
   * pinning; the other kind is refused before this is ever called.
   */
  onUpgradeTls?(request: { x509: boolean }): void;
};

/**
 * The 16-byte pixel format we ask the server to speak: 32bpp, little-endian, true colour, with
 * red at shift 16 / green 8 / blue 0. In little-endian memory that lays each pixel out as B, G, R,
 * X — exactly `RemoteScreenEvent`'s BGRX32.
 */
export function pixelFormatBGRX(): Buffer {
  const pf = Buffer.alloc(16);
  pf[0] = 32; // bits-per-pixel
  pf[1] = 24; // depth
  pf[2] = 0; // big-endian-flag = false
  pf[3] = 1; // true-colour-flag = true
  pf.writeUInt16BE(255, 4); // red-max
  pf.writeUInt16BE(255, 6); // green-max
  pf.writeUInt16BE(255, 8); // blue-max
  pf[10] = 16; // red-shift
  pf[11] = 8; // green-shift
  pf[12] = 0; // blue-shift
  // 13..15 padding
  return pf;
}

/**
 * The VNC authentication response: the 16-byte challenge, DES-encrypted with the password.
 *
 * The quirk that has outlived every reason for it: each key byte's bits are reversed before use.
 * The password is truncated or null-padded to 8 bytes, and the challenge is two ECB blocks.
 */
export function vncAuthResponse(challenge: Buffer, password: string): Buffer {
  const key = Buffer.alloc(8, 0);
  const raw = Buffer.from(password, "latin1");
  raw.copy(key, 0, 0, Math.min(8, raw.length));
  for (let i = 0; i < 8; i++) key[i] = reverseBits(key[i]);
  // Two ECB blocks; DES lives in ./des because OpenSSL 3 will not do single-DES here.
  return Buffer.concat([
    desEncryptBlock(key, challenge.subarray(0, 8)),
    desEncryptBlock(key, challenge.subarray(8, 16)),
  ]);
}

/** Reverse the eight bits of a byte — the VNC-DES key transform. */
export function reverseBits(byte: number): number {
  let out = 0;
  for (let i = 0; i < 8; i++) out |= ((byte >> i) & 1) << (7 - i);
  return out & 0xff;
}

/**
 * RDP-convention button bits (1 left, 2 right, 4 middle) → RFB button-mask (1 left, 2 middle,
 * 4 right). The two protocols number the middle and right buttons the other way round.
 */
export function rfbButtonMask(rdpButtons: number): number {
  let mask = 0;
  if (rdpButtons & 1) mask |= 1; // left
  if (rdpButtons & 4) mask |= 2; // middle
  if (rdpButtons & 2) mask |= 4; // right
  return mask;
}

/** Wheel notches are RFB buttons 4 (up/away) and 5 (down/toward), pressed once per notch. */
export const RFB_WHEEL_UP = 8;
export const RFB_WHEEL_DOWN = 16;

/** A Unicode code point as an X keysym: the 0x01000000 plane. */
export function unicodeToKeysym(code: number): number {
  // Latin-1 keysyms are the code point itself; everything else uses the Unicode plane.
  return code <= 0xff ? code : 0x01000000 + code;
}

/**
 * PC/XT scan code → X11 keysym.
 *
 * The rest of the app speaks scan codes (`src/shared/scancodes.ts`), the same as RDP; VNC wants X
 * keysyms, so the translation lives here and nothing above it changes. Printable keys map to their
 * unshifted ASCII keysym — the server applies Shift from the modifier stream the caller already
 * sends (a shifted character is Shift_L down, the base key, Shift_L up), which is how `type_text`
 * and `press_keys` were built.
 */
export const SCANCODE_TO_KEYSYM: Record<number, number> = {
  0x01: 0xff1b, // Escape
  0x0e: 0xff08, // Backspace
  0x0f: 0xff09, // Tab
  0x1c: 0xff0d, // Enter / Return
  0x1d: 0xffe3, // Control_L
  0x2a: 0xffe1, // Shift_L
  0x36: 0xffe2, // Shift_R
  0x38: 0xffe9, // Alt_L
  0x39: 0x20, // Space
  0x3a: 0xffe5, // Caps_Lock
  0x47: 0xff50, // Home
  0x48: 0xff52, // Up
  0x49: 0xff55, // Page_Up
  0x4b: 0xff51, // Left
  0x4d: 0xff53, // Right
  0x4f: 0xff57, // End
  0x50: 0xff54, // Down
  0x51: 0xff56, // Page_Down
  0x52: 0xff63, // Insert
  0x53: 0xffff, // Delete
  // F1–F10 (0x3b–0x44) → 0xffbe–0xffc7; F11/F12 (0x57/0x58) → 0xffc8/0xffc9
  0x3b: 0xffbe, 0x3c: 0xffbf, 0x3d: 0xffc0, 0x3e: 0xffc1, 0x3f: 0xffc2, 0x40: 0xffc3,
  0x41: 0xffc4, 0x42: 0xffc5, 0x43: 0xffc6, 0x44: 0xffc7, 0x57: 0xffc8, 0x58: 0xffc9,
  // Digits 1–9,0 (0x02–0x0b) → '1'..'9','0'
  0x02: 0x31, 0x03: 0x32, 0x04: 0x33, 0x05: 0x34, 0x06: 0x35, 0x07: 0x36, 0x08: 0x37,
  0x09: 0x38, 0x0a: 0x39, 0x0b: 0x30,
  // Punctuation, unshifted ASCII
  0x0c: 0x2d, // -
  0x0d: 0x3d, // =
  0x1a: 0x5b, // [
  0x1b: 0x5d, // ]
  0x2b: 0x5c, // backslash
  0x27: 0x3b, // ;
  0x28: 0x27, // '
  0x29: 0x60, // `
  0x33: 0x2c, // ,
  0x34: 0x2e, // .
  0x35: 0x2f, // /
  // Letters A–Z (0x10.. / 0x1e.. / 0x2c..) → lowercase a–z
  0x10: 0x71, 0x11: 0x77, 0x12: 0x65, 0x13: 0x72, 0x14: 0x74, 0x15: 0x79, 0x16: 0x75,
  0x17: 0x69, 0x18: 0x6f, 0x19: 0x70,
  0x1e: 0x61, 0x1f: 0x73, 0x20: 0x64, 0x21: 0x66, 0x22: 0x67, 0x23: 0x68, 0x24: 0x6a,
  0x25: 0x6b, 0x26: 0x6c,
  0x2c: 0x7a, 0x2d: 0x78, 0x2e: 0x63, 0x2f: 0x76, 0x30: 0x62, 0x31: 0x6e, 0x32: 0x6d,
};

export function scancodeToKeysym(scancode: number): number | undefined {
  return SCANCODE_TO_KEYSYM[scancode];
}

/**
 * What the same key produces while Shift is held.
 *
 * A scan code names a place on the keyboard and the server applies the modifiers — that is how
 * RDP works, and assuming it here was wrong. RFC 6143 §7.5.4 leaves it to the implementation, and
 * the Unix servers (Xvnc, x11vnc with its default modtweak) resolve it the other way round: they
 * look for a key that produces the keysym asked for and *release* Shift when the keysym is the
 * unshifted one. So `Shift` + keysym `a` types `a`, and `type_text("Passw0rd!")` arrived as
 * `passw0rd1`. Sending the shifted keysym leaves both families in agreement.
 */
const SHIFTED_KEYSYM: Record<number, number> = {
  0x02: 0x21, // !
  0x03: 0x40, // @
  0x04: 0x23, // #
  0x05: 0x24, // $
  0x06: 0x25, // %
  0x07: 0x5e, // ^
  0x08: 0x26, // &
  0x09: 0x2a, // *
  0x0a: 0x28, // (
  0x0b: 0x29, // )
  0x0c: 0x5f, // _
  0x0d: 0x2b, // +
  0x1a: 0x7b, // {
  0x1b: 0x7d, // }
  0x2b: 0x7c, // |
  0x27: 0x3a, // :
  0x28: 0x22, // "
  0x29: 0x7e, // ~
  0x33: 0x3c, // <
  0x34: 0x3e, // >
  0x35: 0x3f, // ?
};

export function shiftedKeysym(scancode: number): number | undefined {
  const base = SCANCODE_TO_KEYSYM[scancode];
  if (base === undefined) return undefined;
  // a–z are the only run where the shifted keysym is arithmetic rather than a different symbol.
  if (base >= 0x61 && base <= 0x7a) return base - 32;
  return SHIFTED_KEYSYM[scancode] ?? base;
}

type Phase =
  | "version"
  | "security"
  /** Standard VNC authentication: a 16-byte challenge to answer with DES. */
  | "auth-challenge"
  /** Apple's: Diffie-Hellman parameters, then credentials sealed with AES. */
  | "ard-challenge"
  /** UltraVNC's: 24 bytes of Diffie-Hellman, then credentials sealed with DES. */
  | "mslogon-challenge"
  /** VeNCrypt's own negotiation, in the order a real server performs it. */
  | "vencrypt-version"
  | "vencrypt-ack"
  | "vencrypt-subtypes"
  | "vencrypt-tls-ack"
  /** Waiting for the socket's owner to finish the TLS handshake. */
  | "tls-handshake"
  | "auth-result"
  | "server-init"
  | "normal";

/** State kept while a FramebufferUpdate's rectangles arrive across chunks. */
type Pending = { rectsLeft: number };

export class RfbClient {
  private buffer: Buffer = Buffer.alloc(0);
  /**
   * Chunks that have arrived but are not worth joining yet, and how many bytes they hold.
   *
   * The first frame of a 4K desktop is 33MB of Raw pixels arriving in hundreds of socket chunks.
   * Joining the whole pending buffer to each one is quadratic — measured at 0.85s of a frozen
   * main process for that frame, which is every window and every other server's terminal. So
   * nothing is copied until the parser can actually use it: `need` is how many bytes the next
   * step is waiting for, and only when that many have arrived is the join done, once.
   */
  private chunks: Buffer[] = [];
  private queued = 0;
  private need = 1;
  private phase: Phase = "version";
  private pending?: Pending;
  private closed = false;
  private surface?: { width: number; height: number; data: Buffer };
  private name = "";
  /**
   * The version both ends settled on (the minor of 3.x).
   *
   * It decides two things that are otherwise invisible: whether the security types arrive as a
   * list or as one 4-byte word (3.3), and whether "no authentication" is followed by a
   * SecurityResult (only from 3.8). Guessing 3.8 at a 3.3 server deadlocked the connection, and
   * guessing it at a 3.7 one read the desktop size as a failure code and said the password was
   * wrong. RFC 6143 §7.1.1: never answer above what the server offered.
   */
  private minor = 8;
  /** The next update must be a full one — the framebuffer's contents are no longer known. */
  private stale = true;

  /** The VeNCrypt sub-type in force, once one has been chosen. */
  private subtype = 0;
  /** Whether the TLS about to be established will present a certificate to pin. */
  private pendingX509 = false;
  /** The connection's one zlib stream, shared by every ZRLE rectangle. */
  private zlib?: zlib.Inflate;
  /** Parsing is stopped while a rectangle is being inflated. */
  private inflating = false;

  constructor(
    private readonly events: RfbEvents,
    /** Where outgoing protocol bytes go — the session writes them to the socket. */
    private send: (bytes: Buffer) => void,
    private readonly credentials: VncCredentials,
  ) {}

  get ready(): boolean {
    return this.phase === "normal" && !this.closed;
  }

  /**
   * The TLS is up: from here the same conversation runs over the new transport.
   *
   * Called by whoever owns the socket after `onUpgradeTls`. Whatever the sub-type wraps happens
   * now — nothing at all, the ordinary challenge, or the user name and password.
   */
  secured(write: (bytes: Buffer) => void): void {
    if (this.closed) return;
    this.send = write;
    const inner = innerOf(this.subtype);
    if (inner === "plain") {
      this.send(plainMessage(this.credentials.username, this.credentials.password));
      this.phase = "auth-result";
    } else if (inner === "vnc") {
      this.phase = "auth-challenge";
    } else {
      this.phase = "auth-result";
    }
    this.pump();
  }

  /** Parse whatever is already in hand — after a transport swap, or a fresh chunk. */
  private pump(): void {
    while (!this.closed && !this.inflating && this.step()) {
      /* keep parsing */
    }
  }

  /**
   * One rectangle's worth of the connection's zlib stream.
   *
   * The stream is continuous across rectangles — that is what makes it compress — so it cannot be
   * inflated a piece at a time with the synchronous calls. The flush is what makes the output for
   * this rectangle come out rather than waiting for more input.
   */
  private inflateZrle(compressed: Buffer): Promise<Buffer> {
    const stream = (this.zlib ??= zlib.createInflate());
    const parts: Buffer[] = [];
    const collect = (chunk: Buffer) => parts.push(chunk);
    stream.on("data", collect);
    return new Promise<Buffer>((resolve, reject) => {
      stream.once("error", reject);
      stream.write(compressed, () => {
        stream.flush(zlib.constants.Z_SYNC_FLUSH, () => {
          stream.removeListener("data", collect);
          resolve(Buffer.concat(parts));
        });
      });
    });
  }

  /** Feed bytes from the socket. */
  receive(chunk: Buffer): void {
    if (this.closed) return;
    this.chunks.push(chunk);
    this.queued += chunk.length;
    const have = this.buffer.length + this.queued;
    if (have > MOST_BUFFER_BYTES) {
      this.fail(t("The screen data is too large."));
      return;
    }
    // Still short of what the parser is waiting for: hold the chunk rather than copy everything.
    if (have < this.need) return;
    if (this.queued > 0) {
      this.buffer =
        this.buffer.length === 0 && this.chunks.length === 1
          ? this.chunks[0]
          : Buffer.concat([this.buffer, ...this.chunks], have);
      this.chunks = [];
      this.queued = 0;
    }
    // Each step consumes what it can and returns false when it needs more bytes.
    this.pump();
  }

  /**
   * Whether `count` bytes are in hand, remembering the shortfall.
   *
   * Every "wait for more" in the parser goes through here, so `need` is always the size of the
   * thing being waited for and `receive` can leave chunks unjoined until it arrives.
   */
  private has(count: number): boolean {
    if (this.buffer.length >= count) return true;
    this.need = count;
    return false;
  }

  private step(): boolean {
    /*
     * Nothing is being waited for until this step says so.
     *
     * `need` is what lets `receive` hold chunks without joining them, and it is only ever raised
     * by a step that ran short. Left standing after a step that did *not* run short it becomes a
     * lie — and the one that mattered: after a five-megabyte rectangle was consumed whole, `need`
     * still said five megabytes, so a smaller frame after it was never joined and never parsed.
     * The server, waiting for a request that only comes after parsing, sent nothing more. The
     * screen stopped, with the connection perfectly alive.
     */
    this.need = 1;
    switch (this.phase) {
      case "version":
        return this.stepVersion();
      case "security":
        return this.stepSecurity();
      case "auth-challenge":
        return this.stepAuthChallenge();
      case "ard-challenge":
        return this.stepArdChallenge();
      case "mslogon-challenge":
        return this.stepMsLogonChallenge();
      case "vencrypt-version":
        return this.stepVeNCryptVersion();
      case "vencrypt-ack":
        return this.stepVeNCryptAck();
      case "vencrypt-subtypes":
        return this.stepVeNCryptSubtypes();
      case "vencrypt-tls-ack":
        return this.stepVeNCryptTlsAck();
      case "tls-handshake":
        return false; // Somebody else's turn: the socket is being wrapped.
      case "auth-result":
        return this.stepAuthResult();
      case "server-init":
        return this.stepServerInit();
      case "normal":
        return this.stepNormal();
    }
  }

  private take(n: number): Buffer | undefined {
    if (!this.has(n)) return undefined;
    const head = this.buffer.subarray(0, n);
    this.buffer = this.buffer.subarray(n);
    return head;
  }

  private stepVersion(): boolean {
    const head = this.take(12); // "RFB 003.008\n"
    if (!head) return false;
    const offered = /^RFB (\d{3})\.(\d{3})\n$/.exec(head.toString("latin1"));
    const major = offered ? Number(offered[1]) : 3;
    const minor = offered ? Number(offered[2]) : 8;
    /*
     * The highest of the three versions this speaks that the server also does.
     *
     * A server may offer more than 3.8 (4.x exists in one vendor's product); answering with its
     * own number would promise messages this does not implement. Anything unrecognised is treated
     * as 3.3, which is the only version every server understands.
     */
    this.minor = major !== 3 ? 8 : minor >= 8 ? 8 : minor >= 7 ? 7 : 3;
    this.send(Buffer.from(`RFB 003.00${this.minor}\n`, "latin1"));
    this.phase = "security";
    return true;
  }

  /** ClientInit — shared, so the operator does not knock anyone else off. */
  private startClient(): void {
    this.send(Buffer.from([1]));
    this.phase = "server-init";
  }

  /** The reason a server gives for refusing, when it gives one. */
  private failWith(at: number, fallback: string): boolean {
    if (!this.has(at + 4)) return false;
    const declared = this.buffer.readUInt32BE(at);
    const length = Math.min(declared, MOST_TEXT_BYTES);
    if (!this.has(at + 4 + length)) return false;
    this.fail(this.buffer.toString("utf8", at + 4, at + 4 + length).trim() || fallback);
    return false;
  }

  private stepSecurity(): boolean {
    /*
     * 3.3 does not negotiate: the server names one type in a 4-byte word and the client answers
     * nothing at all. Reading that as the 3.8 count-and-list made `00 00 00 02` look like "the
     * server refused, and the reason is 682 bytes long" — so the client waited for bytes that
     * were never coming and blamed the network fifteen seconds later.
     */
    if (this.minor < 7) {
      if (!this.has(4)) return false;
      const type = this.buffer.readUInt32BE(0);
      if (type === 0) return this.failWith(4, t("The connection was refused."));
      this.buffer = this.buffer.subarray(4);
      if (type === 1) {
        this.startClient(); // No SecurityResult before 3.8 when there is no authentication.
        return true;
      }
      if (type === 2) {
        this.phase = "auth-challenge";
        return true;
      }
      this.fail(t("This server asked for a way of signing in that is not supported."));
      return false;
    }

    if (!this.has(1)) return false;
    const count = this.buffer[0];
    if (count === 0) return this.failWith(1, t("The connection was refused."));
    if (!this.has(1 + count)) return false;
    const offered = [...this.buffer.subarray(1, 1 + count)];
    this.buffer = this.buffer.subarray(1 + count);

    /* Which way in, out of what this server accepts — the policy is in `security.ts`. */
    const choice = chooseSecurity(offered, this.credentials);
    if ("refuse" in choice) {
      this.fail(choice.refuse);
      return false;
    }
    this.send(Buffer.from([choice.pick]));
    switch (choice.pick) {
      case SEC_VNC_AUTH:
        this.phase = "auth-challenge";
        return true;
      case SEC_ARD:
        this.phase = "ard-challenge";
        return true;
      case SEC_MSLOGON_II:
        this.phase = "mslogon-challenge";
        return true;
      case SEC_VENCRYPT:
        this.phase = "vencrypt-version";
        return true;
      case SEC_NONE:
      default:
        /* 3.7 sends no SecurityResult for None; 3.8 does. Waiting for one that never comes read
           the desktop's own size as a failure code and reported a wrong password. */
        if (this.minor >= 8) this.phase = "auth-result";
        else this.startClient();
        return true;
    }
  }

  /**
   * Apple's challenge: Diffie-Hellman parameters, answered with the credentials sealed under the
   * shared secret. What macOS's own Screen Sharing asks for.
   */
  private stepArdChallenge(): boolean {
    if (!this.has(4)) return false;
    const keyLength = this.buffer.readUInt16BE(2);
    if (keyLength <= 0 || keyLength > 1024) {
      this.fail(t("This server's sign-in parameters are not valid."));
      return false;
    }
    if (!this.has(4 + keyLength * 2)) return false;
    const challenge: ArdChallenge = {
      generator: Buffer.from(this.buffer.subarray(0, 2)),
      keyLength,
      prime: Buffer.from(this.buffer.subarray(4, 4 + keyLength)),
      serverPublic: Buffer.from(this.buffer.subarray(4 + keyLength, 4 + keyLength * 2)),
    };
    this.buffer = this.buffer.subarray(4 + keyLength * 2);
    try {
      this.send(ardResponse(challenge, this.credentials.username, this.credentials.password));
    } catch {
      this.fail(t("Could not answer this server's sign-in (Apple)."));
      return false;
    }
    this.phase = "auth-result";
    return true;
  }

  /** UltraVNC's: 24 bytes of Diffie-Hellman, answered with the credentials sealed under DES. */
  private stepMsLogonChallenge(): boolean {
    if (!this.has(24)) return false;
    const generator = Buffer.from(this.buffer.subarray(0, 8));
    const modulus = Buffer.from(this.buffer.subarray(8, 16));
    const serverPublic = Buffer.from(this.buffer.subarray(16, 24));
    this.buffer = this.buffer.subarray(24);
    try {
      this.send(
        msLogonResponse(
          { generator, modulus, serverPublic },
          this.credentials.username,
          this.credentials.password,
        ),
      );
    } catch {
      this.fail(t("Could not answer this server's sign-in (UltraVNC)."));
      return false;
    }
    this.phase = "auth-result";
    return true;
  }

  /** VeNCrypt speaks its own version first. 0.2 is what every server implementing it offers. */
  private stepVeNCryptVersion(): boolean {
    if (!this.has(2)) return false;
    const major = this.buffer[0];
    const minor = this.buffer[1];
    this.buffer = this.buffer.subarray(2);
    if (major !== 0 || minor < 2) {
      this.fail(t("This server's VeNCrypt ({version}) is not supported.", { version: `${major}.${minor}` }));
      return false;
    }
    this.send(Buffer.from([0, 2]));
    this.phase = "vencrypt-ack";
    return true;
  }

  private stepVeNCryptAck(): boolean {
    if (!this.has(1)) return false;
    const result = this.buffer[0];
    this.buffer = this.buffer.subarray(1);
    if (result !== 0) {
      this.fail(t("This server would not accept VeNCrypt 0.2."));
      return false;
    }
    this.phase = "vencrypt-subtypes";
    return true;
  }

  private stepVeNCryptSubtypes(): boolean {
    if (!this.has(1)) return false;
    const count = this.buffer[0];
    if (count === 0) {
      this.fail(t("This server offered no way of signing in that can be used."));
      return false;
    }
    if (!this.has(1 + count * 4)) return false;
    const offered: number[] = [];
    for (let i = 0; i < count; i++) offered.push(this.buffer.readUInt32BE(1 + i * 4));
    this.buffer = this.buffer.subarray(1 + count * 4);

    const choice = chooseSubtype(offered, this.credentials);
    if ("refuse" in choice) {
      this.fail(choice.refuse);
      return false;
    }
    this.subtype = choice.pick;
    const picked = Buffer.alloc(4);
    picked.writeUInt32BE(choice.pick, 0);
    this.send(picked);

    const { tls, x509 } = tlsOf(choice.pick);
    if (tls) {
      /* Only the TLS sub-types are acknowledged before the handshake — the bare ones are not,
         and reading an ack that never comes is what broke the first attempt at this. */
      this.phase = "vencrypt-tls-ack";
      this.pendingX509 = x509;
      return true;
    }
    // Plain, with no TLS around it: the credentials go immediately, with no acknowledgement.
    this.send(plainMessage(this.credentials.username, this.credentials.password));
    this.phase = "auth-result";
    return true;
  }

  private stepVeNCryptTlsAck(): boolean {
    if (!this.has(1)) return false;
    const result = this.buffer[0];
    this.buffer = this.buffer.subarray(1);
    if (result !== 1) {
      this.fail(t("This server refused to connect over TLS."));
      return false;
    }
    if (this.buffer.length > 0) {
      /* The server sends nothing else until the client starts the handshake; anything here would
         be swallowed by TLS and read as a record. */
      this.fail(t("The screen stream lost its place."));
      return false;
    }
    this.phase = "tls-handshake";
    this.events.onUpgradeTls?.({ x509: this.pendingX509 });
    return false;
  }

  private stepAuthChallenge(): boolean {
    const challenge = this.take(16);
    if (!challenge) return false;
    this.send(vncAuthResponse(challenge, this.credentials.password));
    this.phase = "auth-result";
    return true;
  }

  private stepAuthResult(): boolean {
    if (!this.has(4)) return false;
    const result = this.buffer.readUInt32BE(0);
    if (result === 0) {
      this.buffer = this.buffer.subarray(4);
      this.startClient();
      return true;
    }
    // Failure. Only 3.8 appends a reason; before that the number is all there is.
    if (this.minor >= 8) return this.failWith(4, t("Either the password is wrong, or the sign-in was refused."));
    this.fail(t("Either the password is wrong, or the sign-in was refused."));
    return false;
  }

  private stepServerInit(): boolean {
    if (!this.has(24)) return false;
    const nameLength = Math.min(this.buffer.readUInt32BE(20), MOST_TEXT_BYTES);
    if (!this.has(24 + nameLength)) return false;
    const width = this.buffer.readUInt16BE(0);
    const height = this.buffer.readUInt16BE(2);
    this.name = this.buffer.toString("utf8", 24, 24 + nameLength);
    this.buffer = this.buffer.subarray(24 + nameLength);

    // Ask for the format and encodings we can draw, then the first (full) frame.
    this.send(Buffer.concat([Buffer.from([CLIENT_SET_PIXEL_FORMAT, 0, 0, 0]), pixelFormatBGRX()]));
    /* Order is preference: compressed first, and Raw only as the thing every server has. */
    this.sendEncodings([ENC_ZRLE, ENC_COPY_RECT, ENC_DESKTOP_SIZE, ENC_RAW]);

    if (!this.resize(width, height)) return false;
    this.phase = "normal";
    // Size the canvas before any paint arrives, as the RDP "S" message does.
    this.events.onScreen({ kind: "size", width, height });
    this.events.onReady?.({ width, height, name: this.name });
    this.requestUpdate(false);
    return true;
  }

  private sendEncodings(encodings: number[]): void {
    const body = Buffer.alloc(4 + encodings.length * 4);
    body[0] = CLIENT_SET_ENCODINGS;
    body.writeUInt16BE(encodings.length, 2);
    encodings.forEach((enc, i) => body.writeInt32BE(enc, 4 + i * 4));
    this.send(body);
  }

  /** Ask for the next frame. Incremental after the first, so only what changed arrives. */
  requestUpdate(incremental: boolean): void {
    const surface = this.surface;
    if (!surface) return;
    if (!incremental) this.stale = false;
    const req = Buffer.alloc(10);
    req[0] = CLIENT_FB_UPDATE_REQUEST;
    req[1] = incremental ? 1 : 0;
    req.writeUInt16BE(0, 2);
    req.writeUInt16BE(0, 4);
    req.writeUInt16BE(surface.width, 6);
    req.writeUInt16BE(surface.height, 8);
    this.send(req);
  }

  private stepNormal(): boolean {
    if (this.pending) return this.stepRect();
    if (!this.has(1)) return false;
    const type = this.buffer[0];

    if (type === SERVER_FB_UPDATE) {
      if (!this.has(4)) return false;
      const rects = this.buffer.readUInt16BE(2);
      this.buffer = this.buffer.subarray(4);
      this.pending = { rectsLeft: rects };
      if (rects === 0) this.finishUpdate();
      return true;
    }
    if (type === SERVER_SET_COLOUR_MAP) {
      // We are true-colour, so there is nothing to keep — but we must step over it.
      if (!this.has(6)) return false;
      const count = this.buffer.readUInt16BE(4);
      const total = 6 + count * 6;
      if (!this.has(total)) return false;
      this.buffer = this.buffer.subarray(total);
      return true;
    }
    if (type === SERVER_BELL) {
      this.buffer = this.buffer.subarray(1);
      return true;
    }
    if (type === SERVER_CUT_TEXT) {
      if (!this.has(8)) return false;
      const length = this.buffer.readUInt32BE(4);
      if (length > MOST_CUT_BYTES) {
        this.fail(t("The clipboard contents are too large."));
        return false;
      }
      if (!this.has(8 + length)) return false;
      /* ISO 8859-1 on this wire, whatever the far side meant by it. Read as UTF-8 it produced
         replacement characters for every accented letter a European server copies. */
      const text = this.buffer.toString("latin1", 8, 8 + length);
      this.buffer = this.buffer.subarray(8 + length);
      this.events.onClipboard?.(text);
      return true;
    }
    this.fail(t("The screen stream lost its place."));
    return false;
  }

  private stepRect(): boolean {
    const pending = this.pending;
    if (!pending) return false;
    if (!this.has(12)) return false;
    const x = this.buffer.readUInt16BE(0);
    const y = this.buffer.readUInt16BE(2);
    const width = this.buffer.readUInt16BE(4);
    const height = this.buffer.readUInt16BE(6);
    const encoding = this.buffer.readInt32BE(8);

    if (encoding === ENC_DESKTOP_SIZE) {
      this.buffer = this.buffer.subarray(12);
      if (!this.resize(width, height)) return false;
      /*
       * The desktop changed shape, and what is on it is now unknown.
       *
       * The surface has been replaced with an empty one, so asking for an incremental update
       * would leave a black rectangle that nothing ever repaints — and `read_screen` would hand
       * the agent that black picture to choose click coordinates from.
       */
      this.stale = true;
      this.events.onScreen({ kind: "size", width, height });
      this.afterRect(pending);
      return true;
    }
    if (encoding === ENC_RAW) {
      const surface = this.surface;
      /* Bounds first: the byte count is the server's to declare, and a rectangle that cannot fit
         is either a desync or an attempt to make this process wait for gigabytes. */
      if (!surface || x + width > surface.width || y + height > surface.height) {
        this.fail(t("Part of the screen points outside the screen."));
        return false;
      }
      const bytes = width * height * 4;
      if (!this.has(12 + bytes)) return false;
      const pixels = this.buffer.subarray(12, 12 + bytes);
      this.buffer = this.buffer.subarray(12 + bytes);
      this.paint(x, y, width, height, pixels);
      this.afterRect(pending);
      return true;
    }
    if (encoding === ENC_COPY_RECT) {
      if (!this.has(16)) return false;
      const srcX = this.buffer.readUInt16BE(12);
      const srcY = this.buffer.readUInt16BE(14);
      this.buffer = this.buffer.subarray(16);
      this.copyRect(srcX, srcY, x, y, width, height);
      this.afterRect(pending);
      return true;
    }
    if (encoding === ENC_ZRLE) {
      if (!this.has(16)) return false;
      const bytes = this.buffer.readUInt32BE(12);
      if (bytes > MOST_BUFFER_BYTES) {
        this.fail(t("The screen data is too large."));
        return false;
      }
      if (!this.has(16 + bytes)) return false;
      const surface = this.surface;
      if (!surface || x + width > surface.width || y + height > surface.height) {
        this.fail(t("Part of the screen points outside the screen."));
        return false;
      }
      const compressed = Buffer.from(this.buffer.subarray(16, 16 + bytes));
      this.buffer = this.buffer.subarray(16 + bytes);
      /*
       * One zlib stream for the whole connection, so a rectangle cannot be inflated on its own —
       * and Node's zlib will only do that asynchronously. Parsing stops until the bytes come back;
       * anything that arrives meanwhile waits in the buffer, which is where it would have waited
       * anyway.
       */
      /*
       * Ask for the next frame now, not after this one has been drawn.
       *
       * Inflating and decoding a full-screen rectangle costs some tens of milliseconds, and while
       * that ran the server had nothing to do — measured against a Mac, the far side spent longer
       * waiting for us than we spent waiting for it. The bytes for this rectangle are already in
       * hand, so the request can go out and the two ends work at the same time.
       */
      this.afterRect(pending);
      this.inflating = true;
      void this.inflateZrle(compressed)
        .then((plain) => {
          if (this.closed) return;
          this.paint(x, y, width, height, decodeZrle(plain, width, height), true);
          this.inflating = false;
          this.pump();
        })
        .catch((cause: Error) => {
          this.inflating = false;
          this.fail(cause.message || t("The screen could not be decompressed."));
        });
      return false;
    }
    this.fail(t("Unsupported encoding ({encoding}).", { encoding }));
    return false;
  }

  private afterRect(pending: Pending): void {
    pending.rectsLeft -= 1;
    if (pending.rectsLeft <= 0) this.finishUpdate();
  }

  private finishUpdate(): void {
    this.pending = undefined;
    // Keep the stream flowing. After a resize the whole picture has to be asked for again.
    this.requestUpdate(!this.stale);
  }

  /** A new, empty surface — or a refusal, when the size is not one a desktop could have. */
  private resize(width: number, height: number): boolean {
    if (width <= 0 || height <= 0 || width > MOST_SIDE || height > MOST_SIDE) {
      this.fail(t("The screen size is not valid ({width}×{height}).", { width, height }));
      return false;
    }
    this.surface = { width, height, data: Buffer.alloc(width * height * 4) };
    return true;
  }

  private paint(
    x: number,
    y: number,
    width: number,
    height: number,
    pixels: Buffer,
    /** The buffer was made here and nobody else holds it, so it can go as it is. */
    owned = false,
  ): void {
    /* Nothing to draw, and `createImageData(0, 0)` throws in the window that would draw it. */
    if (width <= 0 || height <= 0) return;
    this.blit(x, y, width, height, pixels);
    this.events.onScreen({
      kind: "paint",
      rect: { x, y, width, height },
      /* A full-screen rectangle is nineteen megabytes; copying it for the sake of it is a
         copy per frame and the collector's work afterwards. */
      pixels: owned && pixels.byteOffset === 0 && pixels.buffer.byteLength === pixels.length
        ? (pixels.buffer as ArrayBuffer)
        : copyOf(pixels),
    });
  }

  private copyRect(srcX: number, srcY: number, x: number, y: number, w: number, h: number): void {
    const surface = this.surface;
    if (!surface) return;
    if (srcX + w > surface.width || srcY + h > surface.height) return;
    if (x + w > surface.width || y + h > surface.height) return;
    const stride = surface.width * 4;
    // Copy into a scratch first: source and destination can overlap.
    const scratch = Buffer.alloc(w * h * 4);
    for (let line = 0; line < h; line++) {
      surface.data.copy(scratch, line * w * 4, (srcY + line) * stride + srcX * 4, (srcY + line) * stride + (srcX + w) * 4);
    }
    this.paint(x, y, w, h, scratch);
  }

  private blit(x: number, y: number, width: number, height: number, pixels: Buffer): void {
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

  /** The whole desktop in BGRA (the 4th byte forced opaque, as the RDP snapshot does). */
  snapshot(): { width: number; height: number; data: Buffer } | undefined {
    const surface = this.surface;
    if (!surface || this.closed) return undefined;
    const data = Buffer.from(surface.data);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    return { width: surface.width, height: surface.height, data };
  }

  size(): { width: number; height: number } | undefined {
    return this.surface ? { width: this.surface.width, height: this.surface.height } : undefined;
  }

  // ── input (client → server) ──────────────────────────────────────────────
  pointer(x: number, y: number, mask: number): void {
    if (!this.ready) return;
    const msg = Buffer.alloc(6);
    msg[0] = CLIENT_POINTER_EVENT;
    msg[1] = mask & 0xff;
    msg.writeUInt16BE(clamp16(x), 2);
    msg.writeUInt16BE(clamp16(y), 4);
    this.send(msg);
  }

  keysym(code: number, down: boolean): void {
    if (!this.ready) return;
    const msg = Buffer.alloc(8);
    msg[0] = CLIENT_KEY_EVENT;
    msg[1] = down ? 1 : 0;
    msg.writeUInt32BE(code >>> 0, 4);
    this.send(msg);
  }

  cutText(text: string): void {
    if (!this.ready || text.length === 0) return;
    /*
     * This wire carries ISO 8859-1 and nothing else.
     *
     * Node's latin1 encoding masks each code unit to its low byte, so copying a kana here would
     * paste `B` on the customer's server — a different character, silently, from a clipboard poll
     * the operator never asked for. Sending nothing is the honest answer.
     */
    if (/[^ -ÿ]/.test(text)) return;
    const body = Buffer.from(text, "latin1");
    if (body.length > MOST_CUT_BYTES) return;
    const msg = Buffer.alloc(8 + body.length);
    msg[0] = CLIENT_CUT_TEXT;
    msg.writeUInt32BE(body.length, 4);
    body.copy(msg, 8);
    this.send(msg);
  }

  end(detail?: string): void {
    if (this.closed) return;
    this.closed = true;
    this.surface = undefined;
    this.buffer = Buffer.alloc(0);
    this.chunks = [];
    this.queued = 0;
    this.zlib?.close();
    this.zlib = undefined;
    this.events.onScreen({ kind: "closed", detail });
  }

  private fail(detail: string): void {
    this.events.onError?.(detail);
    this.end(detail);
  }
}

function clamp16(value: number): number {
  const n = Math.round(value);
  return n < 0 ? 0 : n > 0xffff ? 0xffff : n;
}

/** A view's bytes in a buffer of their own — see the same note in rdpSession.ts. */
function copyOf(view: Buffer): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}
