import { describe, expect, it } from "vitest";
import { decodeZrle } from "./zrle";

/**
 * ZRLE, tile by tile.
 *
 * The encoding that made a real desktop usable: measured against a Mac on the same network, the
 * same minute of work fell from 63MB to 13MB while delivering three and a half times as many
 * pixels — 2.0 bytes per pixel down to 0.12. What is checked here is the part that would be
 * invisible until it was wrong: a mistake in the palette or the run lengths does not fail, it
 * draws the wrong picture.
 *
 * A pixel on this wire is three bytes — blue, green, red — because the format asked for has one
 * byte spare. The surface it lands in is BGRX, so the fourth byte is the opaque padding.
 */

/** The four bytes one pixel occupies in the decoded surface. */
const pixel = (out: Buffer, x: number, y: number, width: number) =>
  [...out.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];

const RED = [0x00, 0x00, 0xff]; // B, G, R on the wire
const BLUE = [0xff, 0x00, 0x00];

describe("a ZRLE tile", () => {
  it("a solid tile is filled with one pixel's colour", () => {
    // subencoding 1 = solid
    const out = decodeZrle(Buffer.from([1, ...RED]), 4, 4);
    expect(out.length).toBe(4 * 4 * 4);
    expect(pixel(out, 0, 0, 4)).toEqual([0x00, 0x00, 0xff, 0xff]);
    expect(pixel(out, 3, 3, 4)).toEqual([0x00, 0x00, 0xff, 0xff]);
  });

  it("a raw tile is laid down in the order its pixels arrive", () => {
    // subencoding 0 = raw, four pixels in 2x2
    const body = Buffer.from([0, ...RED, ...BLUE, ...BLUE, ...RED]);
    const out = decodeZrle(body, 2, 2);
    expect(pixel(out, 0, 0, 2)).toEqual([0x00, 0x00, 0xff, 0xff]);
    expect(pixel(out, 1, 0, 2)).toEqual([0xff, 0x00, 0x00, 0xff]);
    expect(pixel(out, 0, 1, 2)).toEqual([0xff, 0x00, 0x00, 0xff]);
    expect(pixel(out, 1, 1, 2)).toEqual([0x00, 0x00, 0xff, 0xff]);
  });

  it("a two-colour palette is one bit per pixel, padded to a byte at the end of each row", () => {
    // subencoding 2 = palette of two; 4x2 is one byte per row (four bits used, four spare)
    const body = Buffer.from([
      2, ...RED, ...BLUE,
      0b01000000, // row 0: red blue red red (from the top bit)
      0b11000000, // row 1: blue blue red red
    ]);
    const out = decodeZrle(body, 4, 2);
    expect(pixel(out, 0, 0, 4)).toEqual([0x00, 0x00, 0xff, 0xff]); // red
    expect(pixel(out, 1, 0, 4)).toEqual([0xff, 0x00, 0x00, 0xff]); // blue
    expect(pixel(out, 0, 1, 4)).toEqual([0xff, 0x00, 0x00, 0xff]); // blue
    expect(pixel(out, 2, 1, 4)).toEqual([0x00, 0x00, 0xff, 0xff]); // red
  });

  it("plain RLE fills the tile with colours and lengths, one after the other", () => {
    // subencoding 128 = plain RLE. A length is 255s added up, plus one at the end
    const body = Buffer.from([128, ...RED, 1, ...BLUE, 1]); // two red pixels, two blue
    const out = decodeZrle(body, 4, 1);
    expect(pixel(out, 0, 0, 4)).toEqual([0x00, 0x00, 0xff, 0xff]);
    expect(pixel(out, 1, 0, 4)).toEqual([0x00, 0x00, 0xff, 0xff]);
    expect(pixel(out, 2, 0, 4)).toEqual([0xff, 0x00, 0x00, 0xff]);
    expect(pixel(out, 3, 0, 4)).toEqual([0xff, 0x00, 0x00, 0xff]);
  });

  it("in palette RLE, a length follows whenever the top bit is set", () => {
    // subencoding 130 = RLE over a palette of two
    const body = Buffer.from([
      130, ...RED, ...BLUE,
      0x80, 2, // index 0 (red) for three pixels (2+1)
      0x01,    // index 1 (blue) for one pixel
    ]);
    const out = decodeZrle(body, 4, 1);
    expect(pixel(out, 0, 0, 4)).toEqual([0x00, 0x00, 0xff, 0xff]);
    expect(pixel(out, 2, 0, 4)).toEqual([0x00, 0x00, 0xff, 0xff]);
    expect(pixel(out, 3, 0, 4)).toEqual([0xff, 0x00, 0x00, 0xff]);
  });

  it("anything wider than 64 arrives as 64x64 tiles, one after the other", () => {
    // 65x1 is a tile of 64 and a tile of 1. Two solid colours, to see the seam line up.
    const body = Buffer.from([1, ...RED, 1, ...BLUE]);
    const out = decodeZrle(body, 65, 1);
    expect(pixel(out, 63, 0, 65)).toEqual([0x00, 0x00, 0xff, 0xff]);
    expect(pixel(out, 64, 0, 65)).toEqual([0xff, 0x00, 0x00, 0xff]);
  });

  it("data that runs short throws, rather than quietly making a broken picture", () => {
    expect(() => decodeZrle(Buffer.from([0, 0x00, 0x00]), 2, 2)).toThrow();
    expect(() => decodeZrle(Buffer.from([129]), 1, 1)).toThrow(); // a subencoding nobody uses
  });
});
