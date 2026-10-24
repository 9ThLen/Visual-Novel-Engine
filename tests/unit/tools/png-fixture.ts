/**
 * PNGs built byte by byte, so a test can make exactly the damage it means.
 *
 * An image library would refuse to write most of these — which is the point of
 * them — and would make the valid ones depend on its encoder's choices.
 */
import zlib from 'node:zlib';

export interface PngSpec {
  width: number;
  height: number;
  /** 0 grey, 2 RGB, 3 indexed, 4 grey + alpha, 6 RGBA. Defaults to 2. */
  colorType?: number;
  /** Defaults to 8. */
  bitDepth?: number;
  interlaced?: boolean;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ADAM7 = [
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
];

/** A Node buffer (what zlib returns) as plain bytes. */
export function bytesOf(buffer: { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function uint32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

/** The big-endian 32-bit number at `offset`, which is how PNG writes lengths. */
export function uint32At(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

/** One chunk with its length and a correct CRC. */
export function chunk(type: string, data: Uint8Array = new Uint8Array()): Uint8Array {
  const body = concat(ascii(type), data);
  return concat(uint32(data.length), body, uint32(zlib.crc32(body)));
}

/** The uncompressed scanlines, each behind filter byte 0, with a pattern in them. */
export function scanlines(spec: PngSpec): Uint8Array {
  const bitsPerPixel = CHANNELS[spec.colorType ?? 2] * (spec.bitDepth ?? 8);
  const passes = spec.interlaced
    ? ADAM7.map(([x0, y0, dx, dy]) => [
      spec.width > x0 ? Math.ceil((spec.width - x0) / dx) : 0,
      spec.height > y0 ? Math.ceil((spec.height - y0) / dy) : 0,
    ])
    : [[spec.width, spec.height]];
  const rows: Uint8Array[] = [];
  for (const [columns, count] of passes) {
    if (columns === 0 || count === 0) continue;
    const rowBytes = Math.ceil((columns * bitsPerPixel) / 8);
    for (let row = 0; row < count; row += 1) {
      const line = new Uint8Array(1 + rowBytes);
      // Indexed pixels stay 0, the one entry every palette here has.
      if (spec.colorType !== 3) for (let i = 1; i <= rowBytes; i += 1) line[i] = (i * 7 + row * 13) & 0xff;
      rows.push(line);
    }
  }
  return concat(...rows);
}

export const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function header(spec: PngSpec): Uint8Array {
  return chunk('IHDR', concat(
    uint32(spec.width),
    uint32(spec.height),
    new Uint8Array([spec.bitDepth ?? 8, spec.colorType ?? 2, 0, 0, spec.interlaced ? 1 : 0]),
  ));
}

export interface EncodeOptions {
  /** Scanlines to compress instead of the ones the spec describes. */
  raw?: Uint8Array;
  /** The compressed stream to store instead of deflating `raw`. */
  compressed?: Uint8Array;
  /** Split the image data over this many IDAT chunks. */
  idatChunks?: number;
  /** Chunks between the header (and palette) and the image data. */
  beforeImage?: Uint8Array[];
  /** Leave the palette out of an indexed image. */
  noPalette?: boolean;
  /** Leave the IEND chunk off. */
  noEnd?: boolean;
}

/** A PNG of this spec — valid unless the options say otherwise. */
export function encodePng(spec: PngSpec, options: EncodeOptions = {}): Uint8Array {
  const compressed = options.compressed ?? bytesOf(zlib.deflateSync(options.raw ?? scanlines(spec)));
  const parts = [SIGNATURE, header(spec)];
  if (spec.colorType === 3 && !options.noPalette) {
    parts.push(chunk('PLTE', new Uint8Array(3 * 2 ** Math.min(spec.bitDepth ?? 8, 8)).fill(0x80)));
  }
  parts.push(...(options.beforeImage ?? []));
  const step = Math.ceil(compressed.length / (options.idatChunks ?? 1));
  for (let start = 0; start < compressed.length; start += step) {
    parts.push(chunk('IDAT', compressed.subarray(start, start + step)));
  }
  if (!options.noEnd) parts.push(chunk('IEND'));
  return concat(...parts);
}

/** Byte offset of the first chunk of this type. */
export function chunkOffset(png: Uint8Array, type: string): number {
  let offset = SIGNATURE.length;
  while (offset < png.length) {
    if (String.fromCharCode(...png.subarray(offset + 4, offset + 8)) === type) return offset;
    offset += 12 + uint32At(png, offset);
  }
  throw new Error(`no ${type} chunk`);
}
