import {
  MAX_RELEASES_PER_STORY,
  currentPublishedRelease,
  deleteRelease,
  highestReleaseVersion,
  listReleases,
  readReleaseManifest,
  readReleasePayload,
  saveRelease,
  setReleasePublished,
  type ReleaseMeta,
} from '@/lib/release/release-storage';
import { parseReleaseManifest } from '@/lib/release/manifest';
import type { ReleaseManifestV1, ReleasePayloadV1 } from '@/lib/release/types';
import type { StorageLike } from '@/lib/persistent-storage';
import type { SceneRecord } from '@/lib/engine/types';

const STORY_ID = 'story_1';
const MEDIA_URI = 'idb-media://cover-object';

function memoryStorage(): StorageLike & { keys: () => string[]; dump: () => string } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    keys: () => [...map.keys()],
    dump: () => [...map.values()].join('\n'),
  };
}

function manifest(overrides: { releaseId?: string; version?: string } = {}): ReleaseManifestV1 {
  const payloadHash = 'a'.repeat(64);
  const objectHash = 'b'.repeat(64);
  return parseReleaseManifest({
    format: 'vne-release',
    containerVersion: 1,
    schemaVersion: 1,
    createdAt: '2026-08-29T10:00:00.000Z',
    appVersion: '1.0.0',
    story: {
      id: STORY_ID,
      title: 'A Test Novel',
      startSceneId: 'scene_1',
      createdAt: 1,
      updatedAt: 2,
      sceneCount: 2,
    },
    release: {
      releaseId: overrides.releaseId ?? 'release_1',
      storyId: STORY_ID,
      version: overrides.version ?? '1.0.0',
      channel: 'both',
      releasedAt: '2026-08-29T10:00:00.000Z',
      engineVersion: '1.0.0',
      minEngineVersion: '1.0.0',
      payloadHash,
      publication: { author: 'A Writer', languages: ['uk'], contentRating: 'everyone' },
      stats: { scenes: 2, words: 10, readMinutes: 1, endings: 1, branches: 0 },
    },
    counts: { scenes: 2, characters: 0, audioItems: 0, embeddedAssets: 1, totalAssetBytes: 100 },
    payload: { archivePath: 'story.json', sha256: payloadHash, size: 512 },
    assets: [{
      assetId: 'asset_cover',
      // The pin: this URI is why storing a release keeps its media alive.
      sourceReferences: [MEDIA_URI],
      sha256: objectHash,
      size: 100,
      kind: 'image',
      mimeType: 'image/webp',
      originalName: 'cover.webp',
      archivePath: `objects/${objectHash}`,
    }],
  });
}

function payload(): ReleasePayloadV1 {
  return {
    scenes: {
      scene_1: { id: 'scene_1', name: 'One', timeline: [] } as unknown as SceneRecord,
      scene_2: { id: 'scene_2', name: 'Two', timeline: [] } as unknown as SceneRecord,
    },
    characters: [],
    audioLibrary: [],
  };
}

describe('saveRelease', () => {
  it('stores a release and returns its listing record', async () => {
    const storage = memoryStorage();
    const meta = await saveRelease(storage, { manifest: manifest(), payload: payload() });

    expect(meta.releaseId).toBe('release_1');
    expect(meta.published).toBe(true);
    expect(meta.sceneCount).toBe(2);
    expect(meta.totalBytes).toBe(512 + 100);
  });

  it('can store a release without publishing it', async () => {
    const storage = memoryStorage();
    const meta = await saveRelease(storage, {
      manifest: manifest(),
      payload: payload(),
      published: false,
    });
    expect(meta.published).toBe(false);
    expect(currentPublishedRelease(await listReleases(storage, STORY_ID))).toBeNull();
  });

  it('keeps scene bodies out of the index', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });

    const index = await storage.getItem(`vne_release_index_${STORY_ID}`);
    expect(index).toBeTruthy();
    expect(index).not.toContain('timeline');
  });

  it('writes one key per scene', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    const sceneKeys = storage.keys().filter((key) => key.startsWith('vne_release_scene_'));
    expect(sceneKeys).toHaveLength(2);
  });

  it('replaces a release saved twice under the same id', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    expect(await listReleases(storage, STORY_ID)).toHaveLength(1);
  });

  // The invariant the whole local-release design rests on: web-media-cleanup
  // finds live media by scanning persisted values, so the media URI has to be
  // in what we write, or a published story loses its art after the grace
  // window.
  it('persists the media references that pin its assets', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    expect(storage.dump()).toContain(MEDIA_URI);
  });
});

describe('listReleases', () => {
  it('returns nothing for an unknown story', async () => {
    expect(await listReleases(memoryStorage(), 'nobody')).toEqual([]);
  });

  it('orders newest version first', async () => {
    const storage = memoryStorage();
    for (const version of ['1.0.0', '1.10.0', '1.2.0']) {
      await saveRelease(storage, {
        manifest: manifest({ releaseId: `release_${version}`, version }),
        payload: payload(),
      });
    }
    expect((await listReleases(storage, STORY_ID)).map((r) => r.version))
      .toEqual(['1.10.0', '1.2.0', '1.0.0']);
  });

  it('survives a corrupt index rather than throwing', async () => {
    const storage = memoryStorage();
    await storage.setItem(`vne_release_index_${STORY_ID}`, '{not json');
    expect(await listReleases(storage, STORY_ID)).toEqual([]);
  });

  it('drops unparseable entries but keeps the rest', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    const raw = JSON.parse((await storage.getItem(`vne_release_index_${STORY_ID}`)) as string);
    raw.releases.push({ releaseId: 'broken', version: 'not-a-version' });
    raw.releases.push({ nonsense: true });
    await storage.setItem(`vne_release_index_${STORY_ID}`, JSON.stringify(raw));

    const releases = await listReleases(storage, STORY_ID);
    expect(releases).toHaveLength(1);
    expect(releases[0].releaseId).toBe('release_1');
  });
});

describe('reading a release back', () => {
  it('round-trips the manifest', async () => {
    const storage = memoryStorage();
    const source = manifest();
    await saveRelease(storage, { manifest: source, payload: payload() });
    expect(await readReleaseManifest(storage, STORY_ID, 'release_1')).toEqual(source);
  });

  it('round-trips the payload', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    const read = await readReleasePayload(storage, STORY_ID, 'release_1');
    expect(Object.keys(read?.scenes ?? {})).toEqual(['scene_1', 'scene_2']);
  });

  it('returns null for a missing release', async () => {
    const storage = memoryStorage();
    expect(await readReleaseManifest(storage, STORY_ID, 'nope')).toBeNull();
    expect(await readReleasePayload(storage, STORY_ID, 'nope')).toBeNull();
  });

  // Half a story is worse than none: the reader would hit a missing scene
  // partway through instead of being told the release is damaged.
  it('refuses a payload whose scene bodies went missing', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    await storage.removeItem(`vne_release_scene_${STORY_ID}_release_1_scene_2`);
    expect(await readReleasePayload(storage, STORY_ID, 'release_1')).toBeNull();
  });

  it('returns null for a manifest that no longer parses', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    await storage.setItem(
      `vne_release_${STORY_ID}_release_1`,
      JSON.stringify({ version: 1, manifest: { format: 'something-else' } }),
    );
    expect(await readReleaseManifest(storage, STORY_ID, 'release_1')).toBeNull();
  });
});

describe('publishing state', () => {
  it('toggles without touching the artifact', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });

    await setReleasePublished(storage, STORY_ID, 'release_1', false);
    expect(currentPublishedRelease(await listReleases(storage, STORY_ID))).toBeNull();
    expect(await readReleaseManifest(storage, STORY_ID, 'release_1')).not.toBeNull();

    await setReleasePublished(storage, STORY_ID, 'release_1', true);
    expect(currentPublishedRelease(await listReleases(storage, STORY_ID))?.releaseId).toBe('release_1');
  });

  it('ignores an unknown release', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    const after = await setReleasePublished(storage, STORY_ID, 'ghost', false);
    expect(after[0].published).toBe(true);
  });

  it('shows the highest published version, not the highest of all', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest({ releaseId: 'r1', version: '1.0.0' }), payload: payload() });
    await saveRelease(storage, {
      manifest: manifest({ releaseId: 'r2', version: '2.0.0' }),
      payload: payload(),
      published: false,
    });

    const releases = await listReleases(storage, STORY_ID);
    expect(currentPublishedRelease(releases)?.version).toBe('1.0.0');
    expect(highestReleaseVersion(releases)).toBe('2.0.0');
  });
});

describe('deleteRelease', () => {
  it('removes every key it owns', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest(), payload: payload() });
    await deleteRelease(storage, STORY_ID, 'release_1');

    expect(await listReleases(storage, STORY_ID)).toEqual([]);
    expect(storage.keys().filter((key) => key.includes('release_1'))).toEqual([]);
  });

  it('leaves other releases alone', async () => {
    const storage = memoryStorage();
    await saveRelease(storage, { manifest: manifest({ releaseId: 'r1', version: '1.0.0' }), payload: payload() });
    await saveRelease(storage, { manifest: manifest({ releaseId: 'r2', version: '2.0.0' }), payload: payload() });

    await deleteRelease(storage, STORY_ID, 'r1');
    const releases = await listReleases(storage, STORY_ID);
    expect(releases.map((r) => r.releaseId)).toEqual(['r2']);
    expect(await readReleasePayload(storage, STORY_ID, 'r2')).not.toBeNull();
  });

  it('is safe to call for a release that is not there', async () => {
    const storage = memoryStorage();
    await expect(deleteRelease(storage, STORY_ID, 'ghost')).resolves.toEqual([]);
  });
});

describe('history cap', () => {
  async function fill(storage: StorageLike, count: number, published: boolean): Promise<void> {
    for (let i = 1; i <= count; i += 1) {
      await saveRelease(storage, {
        manifest: manifest({ releaseId: `r${i}`, version: `1.0.${i}` }),
        payload: payload(),
        published,
      });
    }
  }

  it('evicts the oldest unpublished release', async () => {
    const storage = memoryStorage();
    const evicted: string[] = [];
    await fill(storage, MAX_RELEASES_PER_STORY, false);
    await saveRelease(storage, {
      manifest: manifest({ releaseId: 'newest', version: '9.0.0' }),
      payload: payload(),
      published: false,
      onEvict: (id) => evicted.push(id),
    });

    const releases = await listReleases(storage, STORY_ID);
    expect(releases).toHaveLength(MAX_RELEASES_PER_STORY);
    expect(evicted).toEqual(['r1']);
    expect(releases.some((r) => r.releaseId === 'r1')).toBe(false);
    expect(releases.some((r) => r.releaseId === 'newest')).toBe(true);
  });

  // Something out there may be playing it; exceeding the cap is the lesser
  // problem.
  it('never evicts a published release, even over the cap', async () => {
    const storage = memoryStorage();
    await fill(storage, MAX_RELEASES_PER_STORY, true);
    await saveRelease(storage, {
      manifest: manifest({ releaseId: 'newest', version: '9.0.0' }),
      payload: payload(),
    });

    const releases = await listReleases(storage, STORY_ID);
    expect(releases).toHaveLength(MAX_RELEASES_PER_STORY + 1);
  });
});

describe('currentPublishedRelease and highestReleaseVersion', () => {
  it('handle an empty history', () => {
    expect(currentPublishedRelease([])).toBeNull();
    expect(highestReleaseVersion([])).toBeNull();
  });

  it('compare versions numerically', () => {
    const releases = [
      { version: '1.9.0', published: true },
      { version: '1.10.0', published: true },
    ] as ReleaseMeta[];
    expect(highestReleaseVersion(releases)).toBe('1.10.0');
  });
});
