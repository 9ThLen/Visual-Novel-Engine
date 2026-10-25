/**
 * Whether a PNG is whole enough for Android's resource compiler to read.
 *
 * A release build "crunches" every PNG it bundles: AAPT2 decodes the picture and
 * writes it back smaller. Decoding is where a damaged file meets libpng, and on
 * Windows every AAPT2 there is (AGP 8.11, build-tools 35 to 37) answers a libpng
 * error with an access violation — no message, no file name, just "AAPT2 process
 * unexpectedly exit" ten minutes into the build. libpng cannot read such a file
 * on Linux either, so an EAS build fails on it too, only after the upload.
 *
 * Browsers and the studio forgive most of what this rejects, which is how such a
 * file reaches a release in the first place: a truncated download or an export
 * cut short looks fine everywhere until an Android build reads it.
 *
 * So this decodes the structure the way libpng will — the chunk sequence, the
 * CRCs, the end marker, and the compressed image data down to its exact size and
 * row filters — and says what is wrong in words an author can act on. It does not
 * reconstruct pixels: nothing past the filter bytes can make libpng fail.
 *
 * It refuses what AAPT2 cannot read and nothing more, checked case by case
 * against AAPT2 8.11: a damaged ancillary chunk, surplus image data, image data
 * interrupted by another chunk, an unknown critical chunk and bytes after IEND
 * all crunch without complaint, so none of them is reported. A refusal here
 * stops a build, and stopping one that would have worked is its own bug.
 */
import { constants as bufferConstants } from 'node:buffer';
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** A Node buffer seen as the plain bytes this module works in, without a copy. */
function bytesOf(buffer: { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** Bit depths the PNG specification allows for each colour type. */
const BIT_DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16], // greyscale
  2: [8, 16], // truecolour
  3: [1, 2, 4, 8], // indexed
  4: [8, 16], // greyscale with alpha
  6: [8, 16], // truecolour with alpha
};
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Adam7's seven passes: column and row of the first pixel, then the steps. */
const ADAM7 = [
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
] as const;

/** What other formats look like, so a mislabelled file is named for what it is. */
function otherFormat(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG';
  if (ascii(0, 4) === 'GIF8') return 'GIF';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'WebP';
  if (ascii(0, 2) === 'BM') return 'BMP';
  return null;
}

/** The scanlines of the image, as `[row count, bytes per row]`, filter byte excluded. */
function scanlineLayout(
  width: number,
  height: number,
  bitsPerPixel: number,
  interlaced: boolean,
): [number, number][] {
  const rowBytes = (pixels: number) => Math.ceil((pixels * bitsPerPixel) / 8);
  if (!interlaced) return [[height, rowBytes(width)]];
  const passes: [number, number][] = [];
  for (const [x0, y0, dx, dy] of ADAM7) {
    const columns = width > x0 ? Math.ceil((width - x0) / dx) : 0;
    const rows = height > y0 ? Math.ceil((height - y0) / dy) : 0;
    // An empty pass has no scanlines at all, not even filter bytes.
    if (columns > 0 && rows > 0) passes.push([rows, rowBytes(columns)]);
  }
  return passes;
}

/**
 * What is wrong with this PNG, or `null` when AAPT2 can crunch it.
 *
 * The answer completes a sentence that starts with the file's name: "is
 * truncated: it has no IEND chunk".
 */
export function pngIntegrityProblem(bytes: Uint8Array): string | null {
  if (bytes.length < SIGNATURE.length || SIGNATURE.some((byte, i) => bytes[i] !== byte)) {
    const format = otherFormat(bytes);
    return format
      ? `is ${format} data with a .png name`
      : 'is not a PNG: it does not start with the PNG signature';
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let header: { width: number; height: number; bitDepth: number; colorType: number; interlaced: boolean } | null = null;
  let sawPalette = false;
  const imageData: Uint8Array[] = [];
  let offset = SIGNATURE.length;
  let ended = false;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      return `is truncated: it ends inside a chunk header at byte ${offset}`;
    }
    const length = view.getUint32(offset);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    if (length > 0x7fffffff || offset + 12 + length > bytes.length) {
      return `is truncated: its ${type} chunk at byte ${offset} runs past the end of the file`;
    }
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    // libpng drops an ancillary chunk whose CRC is wrong and carries on; only a
    // critical one stops it. Critical means bit 5 of the first byte is clear —
    // an upper-case letter — whatever the other three bytes say.
    const critical = (typeBytes[0] & 0x20) === 0;
    const crc = view.getUint32(offset + 8 + length);
    if (critical && zlib.crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== crc) {
      return `is damaged: its ${type} chunk at byte ${offset} fails its CRC check`;
    }

    if (header === null && type !== 'IHDR') {
      return `is damaged: its first chunk is ${type}, not IHDR`;
    }

    if (type === 'IHDR') {
      if (header !== null) return 'is damaged: it has a second IHDR chunk';
      if (length !== 13) return `is damaged: its IHDR chunk is ${length} bytes, not 13`;
      const headerView = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const width = headerView.getUint32(0);
      const height = headerView.getUint32(4);
      const [bitDepth, colorType, compression, filter, interlace] = data.subarray(8, 13);
      if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) {
        return `has an impossible size, ${width}x${height}`;
      }
      if (!BIT_DEPTHS[colorType]?.includes(bitDepth)) {
        return `has colour type ${colorType} at ${bitDepth} bits, which PNG does not define`;
      }
      if (compression !== 0 || filter !== 0 || interlace > 1) {
        return 'is damaged: its IHDR names a compression, filter or interlace method PNG does not define';
      }
      header = { width, height, bitDepth, colorType, interlaced: interlace === 1 };
    } else if (type === 'PLTE') {
      sawPalette = true;
    } else if (type === 'IDAT') {
      if (header!.colorType === 3 && !sawPalette) {
        return 'is damaged: it is an indexed-colour image with no palette';
      }
      imageData.push(data);
    } else if (type === 'IEND') {
      ended = true;
      break;
    }
    offset += 12 + length;
  }

  if (header === null) return 'is truncated: it has no chunks after the signature';
  if (imageData.length === 0) return 'has no image data (no IDAT chunk)';
  if (!ended) return 'is truncated: it has no IEND chunk';

  const bitsPerPixel = CHANNELS[header.colorType] * header.bitDepth;
  const layout = scanlineLayout(header.width, header.height, bitsPerPixel, header.interlaced);
  const expected = layout.reduce((total, [rows, rowBytes]) => total + rows * (1 + rowBytes), 0);
  const size = `${header.width}x${header.height}`;
  if (expected > bufferConstants.MAX_LENGTH) {
    return `is ${size}, too large to decode`;
  }

  const compressed = new Uint8Array(imageData.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of imageData) {
    compressed.set(part, at);
    at += part.length;
  }
  let pixels: Uint8Array;
  try {
    // libpng reads what the header needs and ignores any surplus, so a surplus
    // is allowed — up to a second picture's worth, so a hostile stream cannot
    // take the memory with it.
    pixels = bytesOf(zlib.inflateSync(compressed, {
      maxOutputLength: Math.min(bufferConstants.MAX_LENGTH, expected * 2),
    }));
  } catch (error) {
    const { code, message } = error as NodeJS.ErrnoException;
    // More than that has at least every byte libpng will read. The filters go
    // unchecked, and a file that strange is not worth stopping a build over.
    if (code === 'ERR_BUFFER_TOO_LARGE') return null;
    if (code === 'Z_BUF_ERROR') return 'is truncated: its compressed image data stops early';
    return `is damaged: its compressed image data is corrupt (${message})`;
  }
  if (pixels.length < expected) {
    return `is truncated: its image data holds ${pixels.length} of the ${expected} bytes a ${size} picture needs`;
  }

  // Every scanline starts with one of the five filter types; libpng stops at
  // anything else.
  let position = 0;
  for (const [rows, rowBytes] of layout) {
    for (let row = 0; row < rows; row += 1) {
      if (pixels[position] > 4) {
        return `is damaged: a scanline has filter type ${pixels[position]}, which PNG does not define`;
      }
      position += 1 + rowBytes;
    }
  }
  return null;
}

/** {@link pngIntegrityProblem} for a file on disk. */
export function pngFileProblem(file: string): string | null {
  return pngIntegrityProblem(bytesOf(fs.readFileSync(file)));
}
