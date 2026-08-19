import { describe, expect, it } from "vitest";
import { setLocale } from "../../../shared/i18n";
import type { RemoteScreenEvent } from "../../../shared/remote";
import type { VncCredentials } from "./security";
import {
  RfbClient,
  reverseBits,
  rfbButtonMask,
  scancodeToKeysym,
  shiftedKeysym,
  unicodeToKeysym,
  vncAuthResponse,
} from "./rfb";

/** A client wired to two arrays: what it sent, and what it said about the screen. */
function harness(password = "", extra: Partial<VncCredentials> = {}) {
  const sent: Buffer[] = [];
  const screen: RemoteScreenEvent[] = [];
  const errors: string[] = [];
  const client = new RfbClient(
    { onScreen: (e) => screen.push(e), onError: (detail) => errors.push(detail) },
    (bytes) => sent.push(Buffer.from(bytes)),
    { username: "", password, allowPlaintext: false, ...extra },
  );
  return { client, sent, screen, errors };
}

/** ServerInit: size, a 16-byte pixel format we ignore, and an empty name. */
function serverInit(width: number, height: number) {
  const init = Buffer.alloc(24);
  init.writeUInt16BE(width, 0);
  init.writeUInt16BE(height, 2);
  init.writeUInt32BE(0, 20);
  return init;
}

/** One FramebufferUpdate holding one rectangle. */
function update(
  x: number,
  y: number,
  width: number,
  height: number,
  encoding: number,
  body = Buffer.alloc(0),
) {
  const message = Buffer.alloc(16 + body.length);
  message[0] = 0;
  message.writeUInt16BE(1, 2);
  message.writeUInt16BE(x, 4);
  message.writeUInt16BE(y, 6);
  message.writeUInt16BE(width, 8);
  message.writeUInt16BE(height, 10);
  message.writeInt32BE(encoding, 12);
  body.copy(message, 16);
  return message;
}

setLocale("en");

describe("what RFB has to convert", () => {
  it("reversing the bits (VNC-DES's key transform)", () => {
    expect(reverseBits(0x01)).toBe(0x80);
    expect(reverseBits(0x80)).toBe(0x01);
    expect(reverseBits(0x00)).toBe(0x00);
    expect(reverseBits(0xff)).toBe(0xff);
    expect(reverseBits(0x0a)).toBe(0x50);
  });

  it("the button bits: RDP's (1 left, 2 right, 4 middle) become RFB's (1 left, 2 middle, 4 right)", () => {
    expect(rfbButtonMask(1)).toBe(1); // left
    expect(rfbButtonMask(2)).toBe(4); // right
    expect(rfbButtonMask(4)).toBe(2); // middle
    expect(rfbButtonMask(3)).toBe(5); // left and right
    expect(rfbButtonMask(0)).toBe(0);
  });

  it("a scan code becomes an X keysym", () => {
    expect(scancodeToKeysym(0x1c)).toBe(0xff0d); // Enter
    expect(scancodeToKeysym(0x01)).toBe(0xff1b); // Escape
    expect(scancodeToKeysym(0x2a)).toBe(0xffe1); // Shift_L
    expect(scancodeToKeysym(0x1e)).toBe(0x61); // a
    expect(scancodeToKeysym(0x02)).toBe(0x31); // 1
    expect(scancodeToKeysym(0x3b)).toBe(0xffbe); // F1
    expect(scancodeToKeysym(0x39)).toBe(0x20); // Space
    expect(scancodeToKeysym(0x99)).toBeUndefined();
  });

  it("Unicode→keysym", () => {
    expect(unicodeToKeysym(0x41)).toBe(0x41); // 'A' passes straight through
    expect(unicodeToKeysym(0xe9)).toBe(0xe9); // Latin-1 passes straight through
    expect(unicodeToKeysym(0x3042)).toBe(0x01003042); // a kana goes on the Unicode plane
  });

  /*
   * Holding Shift is not enough on its own. A Unix VNC server (Xvnc, x11vnc) adjusts the
   * modifiers so it can produce the keysym asked for, so an unshifted keysym sent while Shift is
   * held makes it release Shift and type the lower-case letter. `Passw0rd!` arrived as
   * `passw0rd1`.
   */
  it("while Shift is held, the shifted keysym is what goes", () => {
    expect(shiftedKeysym(0x1e)).toBe(0x41); // a → A
    expect(shiftedKeysym(0x2c)).toBe(0x5a); // z → Z
    expect(shiftedKeysym(0x02)).toBe(0x21); // 1 → !
    expect(shiftedKeysym(0x0b)).toBe(0x29); // 0 → )
    expect(shiftedKeysym(0x27)).toBe(0x3a); // ; → :
    expect(shiftedKeysym(0x35)).toBe(0x3f); // / → ?
    // A key with no symbol on it is unchanged: Enter with Shift is still Enter
    expect(shiftedKeysym(0x1c)).toBe(0xff0d);
    expect(shiftedKeysym(0x99)).toBeUndefined();
  });

  it("VNC authentication: sixteen deterministic bytes, and an empty password over a zero challenge is a known DES vector", () => {
    const challenge = Buffer.alloc(16, 0);
    const out = vncAuthResponse(challenge, "");
    expect(out.length).toBe(16);
    // DES(key all zero, block all zero) = 8CA64DE9C1B123A7, the known test vector, twice
    expect(out.toString("hex")).toBe("8ca64de9c1b123a78ca64de9c1b123a7");
    // deterministic
    expect(vncAuthResponse(challenge, "").toString("hex")).toBe(out.toString("hex"));
  });
});

describe("the RFB handshake, and painting a raw rectangle", () => {
  it("version, None, init, a raw rectangle painted — and the right bytes going back", () => {
    const sent: Buffer[] = [];
    const screen: RemoteScreenEvent[] = [];
    let ready: { width: number; height: number } | undefined;
    const client = new RfbClient(
      {
        onScreen: (e) => screen.push(e),
        onReady: (info) => (ready = info),
      },
      (bytes) => sent.push(Buffer.from(bytes)),
      { username: "", password: "", allowPlaintext: false }, // no password → picks None
    );

    // 1) server version
    client.receive(Buffer.from("RFB 003.008\n", "latin1"));
    expect(sent[0].toString("latin1")).toBe("RFB 003.008\n");

    // 2) security: count=1, [None(1)]
    client.receive(Buffer.from([1, 1]));
    expect([...sent[1]]).toEqual([1]); // client picks None

    // 3) SecurityResult OK
    client.receive(Buffer.from([0, 0, 0, 0]));
    expect([...sent[2]]).toEqual([1]); // ClientInit shared=1

    // 4) ServerInit: 2x2, 16-byte pixel format, name-len 0
    const init = Buffer.alloc(24);
    init.writeUInt16BE(2, 0); // width
    init.writeUInt16BE(2, 2); // height
    init.writeUInt32BE(0, 20); // name length
    client.receive(init);
    expect(ready).toEqual({ width: 2, height: 2, name: "" });
    // sent[3] SetPixelFormat (20 bytes), sent[4] SetEncodings, sent[5] FB update request (full)
    expect(sent[3].length).toBe(20);
    expect(sent[3][0]).toBe(0); // SetPixelFormat
    expect(sent[4][0]).toBe(2); // SetEncodings
    expect(sent[5][0]).toBe(3); // FramebufferUpdateRequest
    expect(sent[5][1]).toBe(0); // full (non-incremental)
    // size event emitted
    expect(screen.find((e) => e.kind === "size")).toEqual({ kind: "size", width: 2, height: 2 });

    // 5) FramebufferUpdate: 1 Raw rect at (0,0,2,2) with 16 BGRX bytes
    const rect = Buffer.alloc(4 + 12 + 16);
    rect[0] = 0; // FramebufferUpdate
    rect.writeUInt16BE(1, 2); // 1 rectangle
    rect.writeUInt16BE(0, 4); // x
    rect.writeUInt16BE(0, 6); // y
    rect.writeUInt16BE(2, 8); // w
    rect.writeUInt16BE(2, 10); // h
    rect.writeInt32BE(0, 12); // Raw
    for (let i = 0; i < 16; i++) rect[16 + i] = i + 1; // distinguishable pixels
    client.receive(rect);

    const paint = screen.find((e) => e.kind === "paint");
    expect(paint).toBeTruthy();
    if (paint && paint.kind === "paint") {
      expect(paint.rect).toEqual({ x: 0, y: 0, width: 2, height: 2 });
      expect(new Uint8Array(paint.pixels)).toEqual(
        new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
      );
    }
    // after a full update, it asks for the next incremental frame
    const last = sent[sent.length - 1];
    expect(last[0]).toBe(3); // FramebufferUpdateRequest
    expect(last[1]).toBe(1); // incremental

    // snapshot forces the 4th byte opaque
    const snap = client.snapshot();
    expect(snap?.width).toBe(2);
    expect(snap?.data[3]).toBe(255);
  });
});

/*
 * The handshake differs by version. Assuming 3.8 meant an old server sat silent for fifteen
 * seconds and then timed out, and a 3.7 server was told its password was wrong, which was a lie.
 */
describe("the RFB handshake, version by version", () => {
  it("it never claims a higher version than the server's: 3.3 is answered with 3.3", () => {
    const { client, sent } = harness();
    client.receive(Buffer.from("RFB 003.003\n", "latin1"));
    expect(sent[0].toString("latin1")).toBe("RFB 003.003\n");
  });

  it("3.3: the security type is one four-byte word, and None goes on without a SecurityResult", () => {
    const { client, sent, screen } = harness();
    client.receive(Buffer.from("RFB 003.003\n", "latin1"));
    // A four-byte security type of 1 (None). The client does not send the type back.
    const none = Buffer.alloc(4);
    none.writeUInt32BE(1, 0);
    client.receive(none);
    // What goes next is ClientInit (shared=1) — not a choice of type, and no waiting
    expect([...sent[1]]).toEqual([1]);
    // ServerInit arrives with no SecurityResult in between, and the screen comes up
    client.receive(serverInit(800, 600));
    expect(screen.find((e) => e.kind === "size")).toEqual({
      kind: "size",
      width: 800,
      height: 600,
    });
  });

  it("3.7: with None there is no SecurityResult", () => {
    const { client, sent, screen } = harness();
    client.receive(Buffer.from("RFB 003.007\n", "latin1"));
    expect(sent[0].toString("latin1")).toBe("RFB 003.007\n");
    client.receive(Buffer.from([1, 1])); // one type, None
    expect([...sent[1]]).toEqual([1]); // choose None
    expect([...sent[2]]).toEqual([1]); // then ClientInit, with no wait for a SecurityResult
    client.receive(serverInit(640, 480));
    expect(screen.some((e) => e.kind === "size")).toBe(true);
    // It does not mistake this for a wrong password and close
    expect(screen.some((e) => e.kind === "closed")).toBe(false);
  });
});

describe("what RFB refuses", () => {
  /** Get to ready, so exactly one malformed thing can be fed in. */
  function ready(width = 4, height = 4) {
    const h = harness();
    h.client.receive(Buffer.from("RFB 003.008\n", "latin1"));
    h.client.receive(Buffer.from([1, 1]));
    h.client.receive(Buffer.from([0, 0, 0, 0]));
    h.client.receive(serverInit(width, height));
    h.sent.length = 0;
    h.screen.length = 0;
    return h;
  }

  it("when the size changes it asks for the whole screen next, rather than staying black", () => {
    const { client, sent, screen } = ready();
    client.receive(update(0, 0, 8, 8, -223)); // DesktopSize
    expect(screen.find((e) => e.kind === "size")).toEqual({ kind: "size", width: 8, height: 8 });
    const request = sent[sent.length - 1];
    expect(request[0]).toBe(3); // FramebufferUpdateRequest
    expect(request[1]).toBe(0); // the whole screen, not an incremental one
  });

  it("an impossible size is refused, so the main process is never frozen", () => {
    const { client, screen, errors } = ready();
    client.receive(update(0, 0, 65535, 65535, -223));
    expect(screen.some((e) => e.kind === "closed")).toBe(true);
    expect(errors[0]).toContain("screen size is not valid");
  });

  it("a rectangle pointing outside the screen is refused", () => {
    const { client, errors } = ready(4, 4);
    client.receive(update(3, 3, 8, 8, 0)); // raw, and over the edge
    expect(errors[0]).toContain("points outside the screen");
  });

  it("a rectangle of no area paints nothing, because the canvas would throw", () => {
    const { client, screen } = ready();
    client.receive(update(0, 0, 0, 0, 0));
    expect(screen.some((e) => e.kind === "paint")).toBe(false);
    expect(screen.some((e) => e.kind === "closed")).toBe(false);
  });

  it("a paste is Latin-1, and what cannot be written in it is not sent as something else", () => {
    const { client, sent } = ready();
    client.cutText("あ"); // not sendable
    expect(sent.some((b) => b[0] === 6)).toBe(false);
    client.cutText("hello"); // sendable
    const cut = sent.find((b) => b[0] === 6);
    expect(cut).toBeTruthy();
    expect(cut?.subarray(8).toString("latin1")).toBe("hello");
  });

  it("a paste that arrives is read as Latin-1", () => {
    const { client } = ready();
    const seen: string[] = [];
    // A client of its own, to watch onClipboard directly
    const sent: Buffer[] = [];
    const fresh = new RfbClient(
      { onScreen: () => undefined, onClipboard: (text) => seen.push(text) },
      (bytes) => sent.push(Buffer.from(bytes)),
      { username: "", password: "", allowPlaintext: false },
    );
    fresh.receive(Buffer.from("RFB 003.008\n", "latin1"));
    fresh.receive(Buffer.from([1, 1]));
    fresh.receive(Buffer.from([0, 0, 0, 0]));
    fresh.receive(serverInit(4, 4));
    const body = Buffer.from("café", "latin1");
    const message = Buffer.alloc(8 + body.length);
    message[0] = 3;
    message.writeUInt32BE(body.length, 4);
    body.copy(message, 8);
    fresh.receive(message);
    expect(seen).toEqual(["café"]);
    expect(client.ready).toBe(true);
  });
});

/*
 * A small rectangle after a large one must not stop the parsing.
 *
 * A regression test for a real bug that froze the screen on a real machine. The "bytes still
 * needed" figure, used to decide whether to join two chunks, survived after the large rectangle
 * had been read to the end; a following frame smaller than that figure was never joined, and the
 * parsing stopped. The server was waiting for our request, so nothing more arrived: the
 * connection stayed alive and only the picture froze.
 */
describe("the jam in RFB (a regression)", () => {
  const zlib = require("node:zlib") as typeof import("node:zlib");

  /**
   * A ZRLE rectangle of one 64x64 raw tile, filled with something that does not compress so it
   * comes out deliberately large.
   *
   * Large is the point: without a following update smaller than the "bytes still needed" left
   * over from reading this one, the jam does not happen. ZRLE puts the length of the compressed
   * data (four bytes) after the rectangle header.
   */
  function zrleRect(): Buffer {
    const tile = Buffer.alloc(1 + 64 * 64 * 3);
    tile[0] = 0; // subencoding 0 = raw
    for (let i = 1; i < tile.length; i++) tile[i] = (i * 37 + (i >> 3) * 11) & 0xff;
    const body = zlib.deflateSync(tile);
    const message = Buffer.alloc(20 + body.length);
    message[0] = 0; // FramebufferUpdate
    message.writeUInt16BE(1, 2); // 1 rectangle
    message.writeUInt16BE(0, 4);
    message.writeUInt16BE(0, 6);
    message.writeUInt16BE(64, 8);
    message.writeUInt16BE(64, 10);
    message.writeInt32BE(16, 12); // ZRLE
    message.writeUInt32BE(body.length, 16); // the length of the compressed data
    body.copy(message, 20);
    return message;
  }

  it("a small update still arrives after a large ZRLE was read to the end", async () => {
    const { client, screen } = harness();
    client.receive(Buffer.from("RFB 003.008\n", "latin1"));
    client.receive(Buffer.from([1, 1]));
    client.receive(Buffer.from([0, 0, 0, 0]));
    client.receive(serverInit(64, 64));
    screen.length = 0;

    /*
     * Delivered cut in half, which is what always happens to a large rectangle on a real link.
     * This is the moment "N bytes still needed" becomes a large number — and the bug was that it
     * stayed one after the rectangle had been read.
     */
    const big = zrleRect();
    client.receive(big.subarray(0, 30));
    client.receive(big.subarray(30));

    /*
     * The next small update arrives while the first is still being decompressed.
     *
     * The next frame is asked for before decoding, so on a real machine this order always
     * happens. Smaller than the large "bytes still needed" left behind, this chunk was never
     * joined and never parsed, even once decompression finished. The server waits for our
     * request, and that is where the picture stopped.
     */
    const small = update(0, 0, 2, 2, 0, Buffer.alloc(16, 0x20));
    client.receive(small);
    for (let i = 0; i < 100 && screen.filter((e) => e.kind === "paint").length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(screen.filter((e) => e.kind === "paint").length).toBe(2);
    expect(screen.some((e) => e.kind === "closed")).toBe(false);
  });
});
