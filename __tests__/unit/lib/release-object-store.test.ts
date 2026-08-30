/**
 * The shared object store a release keeps its bytes in.
 *
 * RELEASE-PLAN.md decided this in R2 and it was not built: publishing hashed the
 * media and relied on the media library still holding it. It does, until the
 * author replaces a picture — and then a release that is supposed to be
 * immutable cannot be exported at all. These cases pin the two properties that
 * make the store worth having: an unchanged file is stored once however many
 * releases want it, and deleting one release takes only what nothing else needs.
 */
import {
  forgetReleaseObjects,
  readReleaseObject,
  readReleaseObjectIndex,
  releaseObjectStorageKey,
  saveReleaseObjects,
} from '@/lib/release/object-store';
import {
  createMediaBlobUri,
  setMediaBlobStorageAdapterForTests,
} from '@/lib/idb-storage';
import { sourceFromBytes } from '@/lib/story-backup/hash';
import type { StorageLike } from '@/lib/persistent-storage';
import type { PreparedStoryBackupAsset } from '@/lib/story-backup/types';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  } as StorageLike;
}

/** Stands in for IndexedDB, which jsdom does not provide. */
function blobStore() {
  const blobs = new Map<string, Blob>();
  setMediaBlobStorageAdapterForTests({
    get: async (key: string) => blobs.get(key) ?? null,
    has: async (key: string) => blobs.has(key),
    put: async (key: string, blob: Blob) => { blobs.set(key, blob); },
    delete: async (key: string) => { blobs.delete(key); },
    list: async () => [...blobs.keys()],
  } as never);
  return blobs;
}

function hashOf(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function asset(seed: string, bytes: string): PreparedStoryBackupAsset {
  const data = new TextEncoder().encode(bytes);
  return {
    metadata: {
      assetId: `asset_${seed}`,
      sourceReferences: [`idb-media://${seed}`],
      sha256: hashOf(seed),
      size: data.byteLength,
      kind: 'image',
      mimeType: 'image/png',
      originalName: `${seed}.png`,
      originalExtension: '.png',
      archivePath: `objects/${hashOf(seed)}`,
    },
    source: sourceFromBytes(data),
  };
}

describe('the release object store', () => {
  let blobs: Map<string, Blob>;

  beforeEach(() => { blobs = blobStore(); });
  afterEach(() => setMediaBlobStorageAdapterForTests(null));

  it('stores the bytes and records which release wants them', async () => {
    const storage = memoryStorage();
    const result = await saveReleaseObjects('release_1', [asset('a', 'the picture')], storage);

    expect(result.stored).toEqual([hashOf('a')]);
    expect(result.failed).toEqual([]);
    expect(blobs.has(releaseObjectStorageKey(hashOf('a')))).toBe(true);

    const index = await readReleaseObjectIndex(storage);
    expect(index.objects[hashOf('a')]).toMatchObject({
      uri: createMediaBlobUri(releaseObjectStorageKey(hashOf('a'))),
      releaseIds: ['release_1'],
    });
  });

  it('reads the bytes back by content hash', async () => {
    const storage = memoryStorage();
    await saveReleaseObjects('release_1', [asset('a', 'the picture')], storage);

    const source = await readReleaseObject(hashOf('a'), storage);
    expect(source).not.toBeNull();
    const chunks: Uint8Array[] = [];
    for await (const chunk of source!.open()) chunks.push(chunk);
    expect(new TextDecoder().decode(chunks[0])).toBe('the picture');
  });

  it('knows nothing about a release that predates it', async () => {
    expect(await readReleaseObject(hashOf('z'), memoryStorage())).toBeNull();
  });

  /**
   * Content addressing is what makes keeping the bytes affordable: two versions
   * of a novel usually differ by a page of text, so v1.1 should cost only what
   * actually changed.
   */
  it('writes one copy however many releases want it', async () => {
    const storage = memoryStorage();
    await saveReleaseObjects('release_1', [asset('a', 'shared art')], storage);
    await saveReleaseObjects('release_2', [asset('a', 'shared art')], storage);

    expect(blobs.size).toBe(1);
    const index = await readReleaseObjectIndex(storage);
    expect(index.objects[hashOf('a')].releaseIds).toEqual(['release_1', 'release_2']);
  });

  it('writes one copy however many scenes point at it', async () => {
    const storage = memoryStorage();
    const result = await saveReleaseObjects(
      'release_1',
      [asset('a', 'one file'), asset('a', 'one file')],
      storage,
    );

    expect(result.stored).toEqual([hashOf('a')]);
    expect(blobs.size).toBe(1);
  });

  it('deletes what a removed release alone was keeping', async () => {
    const storage = memoryStorage();
    await saveReleaseObjects('release_1', [asset('a', 'only mine')], storage);

    const { deleted, kept } = await forgetReleaseObjects('release_1', storage);

    expect(deleted).toEqual([hashOf('a')]);
    expect(kept).toEqual([]);
    expect(blobs.size).toBe(0);
    expect((await readReleaseObjectIndex(storage)).objects).toEqual({});
  });

  // Deleting v1 must not take v2's artwork with it.
  it('keeps what another release still wants', async () => {
    const storage = memoryStorage();
    await saveReleaseObjects('release_1', [asset('a', 'shared art')], storage);
    await saveReleaseObjects('release_2', [asset('a', 'shared art')], storage);

    const { deleted, kept } = await forgetReleaseObjects('release_1', storage);

    expect(deleted).toEqual([]);
    expect(kept).toEqual([hashOf('a')]);
    expect(blobs.size).toBe(1);
    expect((await readReleaseObjectIndex(storage)).objects[hashOf('a')].releaseIds)
      .toEqual(['release_2']);
  });

  /**
   * A private window, or a browser with site data switched off. Publishing has
   * to work there: the release is still saved and exporting falls back to the
   * media library, which is what every release did before this store existed.
   * Refusing to publish would trade a weaker guarantee for no release at all.
   */
  it('still publishes when the device will not store blobs', async () => {
    setMediaBlobStorageAdapterForTests({
      get: async () => null,
      has: async () => false,
      put: async () => { throw new Error('no room'); },
      delete: async () => {},
      list: async () => [],
    } as never);
    const storage = memoryStorage();

    const result = await saveReleaseObjects('release_1', [asset('a', 'unwritable')], storage);

    expect(result.stored).toEqual([]);
    expect(result.failed).toEqual([hashOf('a')]);
    expect((await readReleaseObjectIndex(storage)).objects).toEqual({});
  });

  it('refuses a key that is not a content hash', () => {
    expect(() => releaseObjectStorageKey('../escape')).toThrow('Not a content hash');
  });
});
