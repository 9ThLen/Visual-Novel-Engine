/**
 * Which PNGs Android's resource compiler can crunch.
 *
 * Every verdict here was first asked of AAPT2 8.11 itself, on the same bytes:
 * each "stops it" case crashed it (on Windows, with an access violation and no
 * message), and each "shrugs off" case compiled. The check has to agree in both
 * directions — missing a damaged picture costs a release build, and refusing a
 * picture that would have built stops one for nothing.
 */
import path from 'node:path';
import zlib from 'node:zlib';

import { pngFileProblem, pngIntegrityProblem } from '../../../tools/lib/png-integrity';
import {
  ascii,
  bytesOf,
  chunk,
  chunkOffset,
  concat,
  encodePng,
  scanlines,
  uint32At,
  type PngSpec,
} from './png-fixture';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const picture: PngSpec = { width: 64, height: 48 };

/** Flip one byte, leaving every length and CRC as it was. */
function damage(png: Uint8Array, at: number): Uint8Array {
  const copy = new Uint8Array(png);
  copy[at] ^= 0xff;
  return copy;
}

const deflate = (raw: Uint8Array) => bytesOf(zlib.deflateSync(raw));

describe('a PNG the resource compiler can crunch', () => {
  it.each<[string, PngSpec]>([
    ['RGB', picture],
    ['RGBA, interlaced, at an odd size', { width: 13, height: 7, colorType: 6, interlaced: true }],
    ['one-bit grey, interlaced', { width: 9, height: 9, colorType: 0, bitDepth: 1, interlaced: true }],
    ['two-bit grey, interlaced', { width: 11, height: 6, colorType: 0, bitDepth: 2, interlaced: true }],
    ['indexed, four bits', { width: 5, height: 3, colorType: 3, bitDepth: 4 }],
    ['16-bit RGB', { width: 3, height: 3, bitDepth: 16 }],
    ['16-bit grey and alpha, interlaced', { width: 2, height: 9, colorType: 4, bitDepth: 16, interlaced: true }],
    // Most of Adam7's passes are empty here, and an empty pass has no scanlines.
    ['one pixel, interlaced', { width: 1, height: 1, interlaced: true }],
  ])('passes %s', (_, spec) => {
    expect(pngIntegrityProblem(encodePng(spec))).toBeNull();
  });

  it('passes image data spread over several chunks', () => {
    expect(pngIntegrityProblem(encodePng(picture, { idatChunks: 5 }))).toBeNull();
  });

  /** The background a local release build was once blamed on. It was never the file. */
  it('passes the repository\'s own art, read from disk', () => {
    expect(pngFileProblem(path.join(REPO_ROOT, 'assets', 'background', 'bg-rabbits-pattern-soft.png')))
      .toBeNull();
  });
});

describe('damage the resource compiler shrugs off', () => {
  const text = (body: string) => chunk('tEXt', ascii(body));

  it.each<[string, () => Uint8Array]>([
    ['bytes after IEND', () => concat(encodePng(picture), ascii('garbage'))],
    ['an ancillary chunk with a wrong CRC', () => {
      const png = encodePng(picture, { beforeImage: [text('Comment\0hi')] });
      return damage(png, chunkOffset(png, 'tEXt') + 9);
    }],
    // libpng reads the bytes the header needs and ignores the rest.
    ['more image data than the picture needs', () => encodePng(picture, {
      raw: concat(scanlines(picture), new Uint8Array(scanlines(picture).length * 3)),
    })],
    ['image data interrupted by another chunk', () => {
      const png = encodePng(picture, { idatChunks: 2 });
      const first = chunkOffset(png, 'IDAT');
      const second = first + 12 + uint32At(png, first);
      return concat(png.subarray(0, second), text('a\0b'), png.subarray(second));
    }],
    ['a critical chunk nobody defines', () => encodePng(picture, { beforeImage: [chunk('ABCD', new Uint8Array([1]))] })],
    ['a chunk type that is not letters', () => encodePng(picture, { beforeImage: [chunk('12ab', new Uint8Array([1]))] })],
    ['an IEND chunk with data in it', () => concat(
      encodePng(picture, { noEnd: true }),
      chunk('IEND', new Uint8Array([1, 2])),
    )],
    ['bytes after the end of the compressed stream', () => encodePng(picture, {
      compressed: concat(deflate(scanlines(picture)), new Uint8Array([1, 2, 3])),
    })],
  ])('lets through %s', (_, make) => {
    expect(pngIntegrityProblem(make())).toBeNull();
  });
});

describe('what stops the resource compiler', () => {
  it.each<[string, () => Uint8Array, string]>([
    ['a file with no end marker', () => encodePng(picture, { noEnd: true }),
      'is truncated: it has no IEND chunk'],
    ['a file cut off inside a chunk', () => encodePng(picture).subarray(0, 100),
      'is truncated: its IDAT chunk at byte 33 runs past the end of the file'],
    ['a file that is only the signature', () => encodePng(picture).subarray(0, 8),
      'is truncated: it has no chunks after the signature'],
    ['a wrong CRC on the image data', () => damage(encodePng(picture), 33 + 20),
      'is damaged: its IDAT chunk at byte 33 fails its CRC check'],
    ['a wrong CRC on the header', () => damage(encodePng(picture), 8 + 10),
      'is damaged: its IHDR chunk at byte 8 fails its CRC check'],
    ['a wrong CRC on the end marker', () => {
      const png = encodePng(picture);
      return damage(png, png.length - 1);
    }, 'its IEND chunk'],
    ['a wrong CRC on the palette', () => {
      const png = encodePng({ width: 5, height: 3, colorType: 3, bitDepth: 4 });
      return damage(png, chunkOffset(png, 'PLTE') + 10);
    }, 'its PLTE chunk at byte 33 fails its CRC check'],
    ['image data a row short', () => encodePng(picture, { raw: scanlines({ width: 64, height: 47 }) }),
      'is truncated: its image data holds 9071 of the 9264 bytes a 64x48 picture needs'],
    ['a compressed stream that stops early', () => encodePng(picture, {
      compressed: deflate(scanlines(picture)).subarray(0, 100),
    }), 'is truncated: its compressed image data stops early'],
    ['a corrupt compressed stream', () => {
      const compressed = deflate(scanlines(picture));
      compressed[30] ^= 0x55;
      return encodePng(picture, { compressed });
    }, 'is damaged: its compressed image data is corrupt'],
    ['a scanline filter that does not exist', () => {
      const raw = scanlines(picture);
      raw[(picture.height - 1) * (1 + picture.width * 3)] = 5;
      return encodePng(picture, { raw });
    }, 'is damaged: a scanline has filter type 5, which PNG does not define'],
    ['an indexed image with no palette', () => encodePng({ width: 5, height: 3, colorType: 3, bitDepth: 4 }, { noPalette: true }),
      'is damaged: it is an indexed-colour image with no palette'],
    ['a bit depth its colour type cannot have', () => encodePng({ width: 4, height: 4, bitDepth: 4 }),
      'has colour type 2 at 4 bits, which PNG does not define'],
    ['a picture with no width', () => encodePng({ width: 0, height: 4 }),
      'has an impossible size, 0x4'],
    ['a first chunk that is not the header', () => concat(
      encodePng(picture).subarray(0, 8),
      chunk('tEXt', ascii('a\0b')),
      encodePng(picture).subarray(8),
    ), 'is damaged: its first chunk is tEXt, not IHDR'],
  ])('refuses %s', (_, make, message) => {
    expect(pngIntegrityProblem(make())).toContain(message);
  });

  /** A mislabelled file is named for what it is, which is the fix the author needs. */
  it.each<[string, Uint8Array]>([
    ['JPEG', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])],
    ['GIF', concat(ascii('GIF89a'), new Uint8Array([1, 0, 1, 0, 0, 0]))],
    ['WebP', concat(ascii('RIFF'), new Uint8Array(4), ascii('WEBPVP8 '))],
  ])('names %s data with a .png name', (format, bytes) => {
    expect(pngIntegrityProblem(bytes)).toBe(`is ${format} data with a .png name`);
  });

  it('refuses a file that is no picture at all', () => {
    expect(pngIntegrityProblem(ascii('not a picture'))).toBe(
      'is not a PNG: it does not start with the PNG signature',
    );
  });
});
