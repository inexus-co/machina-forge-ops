import { t } from "../../../shared/i18n";
/**
 * ZRLE — the encoding that makes a real desktop usable.
 *
 * Measured against a Mac on the same network, with only Raw on offer: a 2940×1912 desktop is
 * 22.5MB per frame, arriving at 3–7MB/s. Four to seven seconds a frame, which is what "the mouse
 * keeps up but the picture does not" looks like. ZRLE sends the same screen as tiles through one
 * zlib stream, with runs and palettes for the flat parts, and takes one to two orders of magnitude
 * less of it.
 *
 * The decoding here produces the same BGRX32 the Raw path does, so nothing downstream — the
 * canvas, the snapshot the agent reads — learns that it was compressed on the way.
 *
 * A note on the pixel: because the format asked for is 32bpp at depth 24 with one byte unused,
 * ZRLE uses the *compressed pixel*, which is three bytes rather than four. Little-endian with red
 * at shift 16 puts them on the wire as blue, green, red — which is the first three bytes of the
 * surface, so each one is a straight copy and the fourth byte is padding.
 */

const TILE = 64;
/** Blue, green, red: a CPIXEL for the format in `pixelFormatBGRX`. */
const CPIXEL = 3;

class Reader {
  private at = 0;
  constructor(private readonly data: Buffer) {}

  byte(): number {
    if (this.at >= this.data.length) throw new Error(t("The ZRLE data is incomplete."));
    return this.data[this.at++];
  }

  /** One compressed pixel, straight into a destination as B, G, R, opaque. */
  pixelInto(target: Buffer, at: number): void {
    if (this.at + CPIXEL > this.data.length) throw new Error(t("The ZRLE data is incomplete."));
    target[at] = this.data[this.at];
    target[at + 1] = this.data[this.at + 1];
    target[at + 2] = this.data[this.at + 2];
    target[at + 3] = 0xff;
    this.at += CPIXEL;
  }

  /** A palette entry, kept as one 4-byte pixel to copy from. */
  pixel(): Buffer {
    const pixel = Buffer.alloc(4);
    this.pixelInto(pixel, 0);
    return pixel;
  }

  /** A run length: 255s add up, and the value is one more than the total. */
  runLength(): number {
    let total = 1;
    for (;;) {
      const byte = this.byte();
      total += byte;
      if (byte !== 255) return total;
    }
  }

  bytes(count: number): Buffer {
    if (this.at + count > this.data.length) throw new Error(t("The ZRLE data is incomplete."));
    const slice = this.data.subarray(this.at, this.at + count);
    this.at += count;
    return slice;
  }
}

/** How many bits one palette index takes, for a palette of this size. */
function indexBits(paletteSize: number): number {
  if (paletteSize <= 2) return 1;
  if (paletteSize <= 4) return 2;
  return 4;
}

/**
 * One ZRLE rectangle's inflated bytes → a BGRX32 rectangle.
 *
 * Throws on anything malformed; the caller ends the session, because a rectangle that cannot be
 * read means the stream is no longer where it thinks it is.
 */
export function decodeZrle(data: Buffer, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  const stride = width * 4;
  const read = new Reader(data);

  for (let tileY = 0; tileY < height; tileY += TILE) {
    const tileH = Math.min(TILE, height - tileY);
    for (let tileX = 0; tileX < width; tileX += TILE) {
      const tileW = Math.min(TILE, width - tileX);
      const at = (x: number, y: number) => (tileY + y) * stride + (tileX + x) * 4;
      const sub = read.byte();

      if (sub === 0) {
        // Raw tile, pixel by pixel.
        for (let y = 0; y < tileH; y++) {
          for (let x = 0; x < tileW; x++) read.pixelInto(out, at(x, y));
        }
        continue;
      }

      if (sub === 1) {
        // One colour for the whole tile — a desktop background costs four bytes.
        const solid = read.pixel();
        for (let y = 0; y < tileH; y++) {
          for (let x = 0; x < tileW; x++) solid.copy(out, at(x, y));
        }
        continue;
      }

      if (sub >= 2 && sub <= 16) {
        // Packed palette: indices bit-packed, each row padded to a byte.
        const palette = Array.from({ length: sub }, () => read.pixel());
        const bits = indexBits(sub);
        const perByte = 8 / bits;
        const rowBytes = Math.ceil(tileW / perByte);
        for (let y = 0; y < tileH; y++) {
          const row = read.bytes(rowBytes);
          for (let x = 0; x < tileW; x++) {
            const packed = row[Math.floor(x / perByte)];
            const shift = 8 - bits * ((x % perByte) + 1);
            const index = (packed >> shift) & ((1 << bits) - 1);
            (palette[index] ?? palette[0]).copy(out, at(x, y));
          }
        }
        continue;
      }

      if (sub === 128) {
        // Plain run-length: a colour and how many of it, until the tile is full.
        let filled = 0;
        const total = tileW * tileH;
        while (filled < total) {
          const colour = read.pixel();
          const run = Math.min(read.runLength(), total - filled);
          for (let i = 0; i < run; i++, filled++) {
            colour.copy(out, at(filled % tileW, Math.floor(filled / tileW)));
          }
        }
        continue;
      }

      if (sub >= 130) {
        // Palette with runs: the common case for text and window chrome.
        const palette = Array.from({ length: sub - 128 }, () => read.pixel());
        let filled = 0;
        const total = tileW * tileH;
        while (filled < total) {
          const entry = read.byte();
          const colour = palette[entry & 0x7f] ?? palette[0];
          const run = entry & 0x80 ? Math.min(read.runLength(), total - filled) : 1;
          for (let i = 0; i < run; i++, filled++) {
            colour.copy(out, at(filled % tileW, Math.floor(filled / tileW)));
          }
        }
        continue;
      }

      throw new Error(t("Unsupported ZRLE tile ({tile}).", { tile: sub }));
    }
  }

  return out;
}
