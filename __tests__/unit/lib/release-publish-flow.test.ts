import { publishStoryRelease, resolveEngineVersion } from '@/lib/release/service';
import {
  currentPublishedRelease,
  listReleases,
  readReleaseManifest,
  readReleasePayload,
} from '@/lib/release/release-storage';
import type { StorageLike } from '@/lib/persistent-storage';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { useAppStore } from '@/stores/use-app-store';
import { setMediaBlobStorageAdapterForTests } from '@/lib/idb-storage';
import { readReleaseObjectIndex } from '@/lib/release/object-store';

const STORY_ID = 'publish-flow-story';
const COVER_URI = 'data:image/png;base64,AQID';

function memoryStorage(): StorageLike & { dump: () => string } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    dump: () => [...map.values()].join('\n'),
  };
}

function blobStore(): void {
  const blobs = new Map<string, Blob>();
  setMediaBlobStorageAdapterForTests({
    get: async (key: string) => blobs.get(key) ?? null,
    has: async (key: string) => blobs.has(key),
    put: async (key: string, blob: Blob) => { blobs.set(key, blob); },
    delete: async (key: string) => { blobs.delete(key); },
    list: async () => [...blobs.keys()],
  } as never);
}

function scene(id: string, isStart = false): SceneRecord {
  const timeline: TimelineStep[] = [
    {
      id: `${id}-text`,
      blockType: 'text',
      collapsed: false,
      enabled: true,
      data: { content: 'A door opens onto a quiet room.' },
    },
    {
      id: `${id}-draft`,
      blockType: 'text',
      collapsed: false,
      enabled: false,
      data: { content: 'DRAFT ONLY do not ship' },
    },
  ] as unknown as TimelineStep[];

  return {
    id,
    storyId: STORY_ID,
    name: id,
    description: '',
    tags: [],
    isStart,
    connections: [],
    timeline,
    sceneState: { characters: [], activeEffects: [], soundEvents: [] },
  } as unknown as SceneRecord;
}

const story: StoryMetadata = {
  id: STORY_ID,
  title: 'A Publishable Novel',
  description: 'Complete enough to release.',
  author: 'A Writer',
  startSceneId: 'start',
  createdAt: 1,
  updatedAt: 2,
  sceneCount: 2,
  thumbnailUri: COVER_URI,
  contentRating: 'everyone',
  languages: ['uk'],
  aiAssisted: false,
};

describe('publishing a story end to end', () => {
  let restore: () => void;

  beforeEach(() => {
    blobStore();
    const before = useAppStore.getState();
    useAppStore.setState({
      storiesMetadata: [story],
      sceneRecordsByStory: { [STORY_ID]: { start: scene('start', true), finish: scene('finish') } },
      sceneRecordHydration: { [STORY_ID]: 'full' },
      characterLibraries: { [STORY_ID]: [] },
      audioLibraries: { [STORY_ID]: [] },
      mediaLibrary: [],
      mediaAssetIdsByStory: {},
    } as never);
    restore = () => useAppStore.setState(before, true);
  });

  afterEach(() => {
    setMediaBlobStorageAdapterForTests(null);
    restore();
  });

  it('compiles, stores and reads back a release', async () => {
    const storage = memoryStorage();

    const meta = await publishStoryRelease({
      storyId: STORY_ID,
      version: '1.0.0',
      channel: 'both',
      notes: 'First release.',
      storage,
    });

    expect(meta.version).toBe('1.0.0');
    expect(meta.published).toBe(true);
    expect(meta.sceneCount).toBe(2);

    const releases = await listReleases(storage, STORY_ID);
    expect(currentPublishedRelease(releases)?.releaseId).toBe(meta.releaseId);

    const manifest = await readReleaseManifest(storage, STORY_ID, meta.releaseId);
    expect(manifest?.release.notes).toBe('First release.');
    expect(manifest?.release.publication.author).toBe('A Writer');
    expect(manifest?.story.title).toBe('A Publishable Novel');

    const payload = await readReleasePayload(storage, STORY_ID, meta.releaseId);
    expect(Object.keys(payload?.scenes ?? {}).sort()).toEqual(['finish', 'start']);
  });

  it('does not ship the author\'s disabled drafts', async () => {
    const storage = memoryStorage();
    await publishStoryRelease({ storyId: STORY_ID, version: '1.0.0', channel: 'both', storage });
    expect(storage.dump()).not.toContain('DRAFT ONLY');
  });

  // The whole local-release design rests on this: web-media-cleanup keeps media
  // alive by finding its references in persisted values.
  it('persists the media reference that pins the cover', async () => {
    const storage = memoryStorage();
    await publishStoryRelease({ storyId: STORY_ID, version: '1.0.0', channel: 'both', storage });
    expect(storage.dump()).toContain(COVER_URI);
  });

  it('keeps both versions when a story is released twice', async () => {
    const storage = memoryStorage();
    await publishStoryRelease({ storyId: STORY_ID, version: '1.0.0', channel: 'both', storage });
    const second = await publishStoryRelease({
      storyId: STORY_ID,
      version: '1.1.0',
      channel: 'both',
      storage,
    });

    const releases = await listReleases(storage, STORY_ID);
    expect(releases.map((release) => release.version)).toEqual(['1.1.0', '1.0.0']);
    expect(currentPublishedRelease(releases)?.releaseId).toBe(second.releaseId);
    // The older artifact survives: someone may still be reading it.
    expect(await readReleasePayload(storage, STORY_ID, releases[1].releaseId)).not.toBeNull();
  });

  it('can compile without publishing to the showcase', async () => {
    const storage = memoryStorage();
    const meta = await publishStoryRelease({
      storyId: STORY_ID,
      version: '1.0.0',
      channel: 'app',
      published: false,
      storage,
    });

    expect(meta.published).toBe(false);
    expect(currentPublishedRelease(await listReleases(storage, STORY_ID))).toBeNull();
    expect(await readReleaseManifest(storage, STORY_ID, meta.releaseId)).not.toBeNull();
  });

  it('does not mint a mutable release when its media cannot be secured', async () => {
    setMediaBlobStorageAdapterForTests({
      get: async () => null,
      has: async () => false,
      put: async () => { throw new Error('no room'); },
      delete: async () => {},
      list: async () => [],
    } as never);
    const storage = memoryStorage();

    await expect(publishStoryRelease({
      storyId: STORY_ID,
      version: '1.0.0',
      channel: 'both',
      storage,
    })).rejects.toThrow(/could not be secured/);

    expect(await listReleases(storage, STORY_ID)).toEqual([]);
    expect((await readReleaseObjectIndex(storage)).objects).toEqual({});
  });

  it('refuses to publish a story missing its publication facts', async () => {
    useAppStore.setState({
      storiesMetadata: [{ ...story, contentRating: undefined }],
    } as never);

    await expect(publishStoryRelease({
      storyId: STORY_ID,
      version: '1.0.0',
      channel: 'both',
      storage: memoryStorage(),
    })).rejects.toThrow(/content rating/);
  });
});

describe('resolveEngineVersion', () => {
  it('takes a plain version as it is', () => {
    expect(resolveEngineVersion('2.3.4')).toBe('2.3.4');
  });

  it('falls back rather than stamping something a manifest would reject', () => {
    expect(resolveEngineVersion('1.0.0-beta.2')).toBe('1.0.0');
    expect(resolveEngineVersion(undefined)).toBe('1.0.0');
  });
});
