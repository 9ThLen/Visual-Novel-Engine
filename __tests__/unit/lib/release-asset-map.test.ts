import {
  buildReleaseAssetMap,
  releaseAssetFiles,
  releaseObjectFileName,
  RELEASE_MEDIA_DIR,
} from '@/lib/release/asset-map';
import type { ReleaseAsset, ReleaseManifestV1 } from '@/lib/release/types';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function asset(overrides: Partial<ReleaseAsset> = {}): ReleaseAsset {
  return {
    assetId: 'asset_1',
    sourceReferences: ['idb-media://one'],
    sha256: HASH_A,
    size: 10,
    kind: 'image',
    mimeType: 'image/png',
    originalName: 'one.png',
    originalExtension: '.png',
    archivePath: `objects/${HASH_A}`,
    ...overrides,
  };
}

function manifest(assets: ReleaseAsset[]): ReleaseManifestV1 {
  return { assets } as ReleaseManifestV1;
}

describe('the packaged asset map', () => {
  /**
   * The whole reason the map exists: a scene stores whatever string the author's
   * device used, and on web that is a uri naming a browser database the reader
   * does not have. Only the manifest knows it means these bytes.
   */
  it('answers to every name the story might use for one file', () => {
    const map = buildReleaseAssetMap(manifest([
      asset({ assetId: 'cover', sourceReferences: ['idb-media://cover', 'assets/cover.png'] }),
    ]));

    expect(map['cover']).toBe(`${RELEASE_MEDIA_DIR}/${HASH_A}.png`);
    expect(map['idb-media://cover']).toBe(`${RELEASE_MEDIA_DIR}/${HASH_A}.png`);
    expect(map['assets/cover.png']).toBe(`${RELEASE_MEDIA_DIR}/${HASH_A}.png`);
  });

  // Content addressing is the point: the same picture used twice is one file,
  // and it keeps its name across releases so a host caches it once.
  it('gives identical bytes one file, whatever they are called', () => {
    const map = buildReleaseAssetMap(manifest([
      asset({ assetId: 'first', sourceReferences: ['idb-media://first'] }),
      asset({ assetId: 'second', sourceReferences: ['idb-media://second'] }),
    ]));

    expect(map['idb-media://first']).toBe(map['idb-media://second']);
    expect(releaseAssetFiles(manifest([
      asset({ assetId: 'first' }),
      asset({ assetId: 'second' }),
    ]))).toHaveLength(1);
  });

  it('lists each distinct file once, with its size', () => {
    const files = releaseAssetFiles(manifest([
      asset(),
      asset({ assetId: 'other', sha256: HASH_B, size: 20, archivePath: `objects/${HASH_B}` }),
    ]));

    expect(files).toEqual([
      { sha256: HASH_A, fileName: `${HASH_A}.png`, size: 10 },
      { sha256: HASH_B, fileName: `${HASH_B}.png`, size: 20 },
    ]);
  });

  /**
   * A static host reads the content type off the extension, and `<audio>`
   * refuses a source served as octet-stream — an image would sniff its way
   * through, but sound would simply never play.
   */
  it('derives an extension from the media type when none was recorded', () => {
    expect(releaseObjectFileName({
      sha256: HASH_A,
      mimeType: 'audio/mpeg',
      originalExtension: undefined,
    })).toBe(`${HASH_A}.mp3`);

    expect(releaseObjectFileName({
      sha256: HASH_A,
      mimeType: 'video/webm; codecs=vp9',
      originalExtension: undefined,
    })).toBe(`${HASH_A}.webm`);
  });

  it('falls back to .bin rather than inventing an extension', () => {
    expect(releaseObjectFileName({
      sha256: HASH_A,
      mimeType: 'application/octet-stream',
      originalExtension: undefined,
    })).toBe(`${HASH_A}.bin`);
  });

  // A recorded extension is not to be trusted verbatim: it lands in a filename.
  it('ignores a recorded extension that is not one', () => {
    expect(releaseObjectFileName({
      sha256: HASH_A,
      mimeType: 'image/png',
      originalExtension: '../../etc/passwd',
    })).toBe(`${HASH_A}.png`);
  });

  it('honours a different media directory', () => {
    const map = buildReleaseAssetMap(manifest([asset()]), { mediaDir: 'files/media/' });
    expect(map['idb-media://one']).toBe(`files/media/${HASH_A}.png`);
  });

  it('is empty for a release that packages nothing', () => {
    expect(buildReleaseAssetMap(manifest([]))).toEqual({});
  });
});
