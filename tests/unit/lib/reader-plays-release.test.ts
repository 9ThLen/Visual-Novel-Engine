import { createReleasesSlice } from '@/stores/app-store-slices/releases-slice';
import { saveRelease, type ReleaseMeta } from '@/lib/release/release-storage';
import type { ReleaseShowcaseSource } from '@/lib/showcase/release-showcase';
import { parseReleaseManifest } from '@/lib/release/manifest';
import {
  getReaderSceneRecord,
  getReaderSceneRecordMap,
  type ReaderReleaseSource,
} from '@/lib/scene-access';
import type { StorageLike } from '@/lib/persistent-storage';
import type { ReleaseManifestV1 } from '@/lib/release/types';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';

const STORY_ID = 'reader-release-story';
const PAYLOAD_HASH = 'a'.repeat(64);

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

function scene(id: string, text: string): SceneRecord {
  return {
    id,
    storyId: STORY_ID,
    name: id,
    timeline: [
      { id: `${id}-text`, blockType: 'text', collapsed: false, enabled: true, data: { content: text } },
    ] as unknown as TimelineStep[],
    connections: [],
  } as unknown as SceneRecord;
}

function firstText(record: SceneRecord | undefined): string | undefined {
  return (record?.timeline?.[0] as { data?: { content?: string } } | undefined)?.data?.content;
}

const story: StoryMetadata = {
  id: STORY_ID,
  title: 'A Frozen Novel',
  startSceneId: 'start',
  createdAt: 1,
  updatedAt: 2,
  sceneCount: 1,
};

function manifest(): ReleaseManifestV1 {
  return parseReleaseManifest({
    format: 'vne-release',
    containerVersion: 1,
    schemaVersion: 1,
    createdAt: '2026-08-30T10:00:00.000Z',
    appVersion: '1.0.0',
    story,
    release: {
      releaseId: 'release_1',
      storyId: STORY_ID,
      version: '1.0.0',
      channel: 'both',
      releasedAt: '2026-08-30T10:00:00.000Z',
      engineVersion: '1.0.0',
      minEngineVersion: '1.0.0',
      payloadHash: PAYLOAD_HASH,
      publication: { author: 'A Writer', languages: ['uk'], contentRating: 'everyone' },
      stats: { scenes: 1, words: 5, readMinutes: 1, endings: 1, branches: 0 },
      showcase: { teaser: null, bannerBackgroundAssetId: null, terminalSceneIds: ['start'] },
    },
    counts: { scenes: 1, characters: 0, audioItems: 0, embeddedAssets: 0, totalAssetBytes: 0 },
    payload: { archivePath: 'story.json', sha256: PAYLOAD_HASH, size: 128 },
    assets: [],
  });
}

interface HarnessState {
  storiesMetadata: StoryMetadata[];
  releasesByStory: Record<string, ReleaseMeta[]>;
  releaseShowcaseByStory: Record<string, ReleaseShowcaseSource>;
  readerRelease: ReaderReleaseSource | null;
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
}

/** A minimal store double: the slice only touches these fields. */
function createHarness(storage: StorageLike) {
  let state: HarnessState = {
    storiesMetadata: [story],
    releasesByStory: {},
    releaseShowcaseByStory: {},
    readerRelease: null,
    // The author's copy, edited after the release was cut.
    sceneRecordsByStory: { [STORY_ID]: { start: scene('start', 'Rewritten after publishing.') } },
  };

  const set = (update: unknown) => {
    const patch = typeof update === 'function'
      ? (update as (current: HarnessState) => Partial<HarnessState>)(state)
      : update as Partial<HarnessState>;
    state = { ...state, ...patch };
  };
  // The real store's get() returns state *and* actions -- the slice calls its
  // own loadPublishedReleases through it.
  let slice: ReturnType<typeof createReleasesSlice>;
  const get = () => ({ ...state, ...slice });
  slice = createReleasesSlice(set as never, get as never, storage);

  return { slice, snapshot: (): HarnessState => state };
}

async function storeRelease(storage: StorageLike): Promise<void> {
  await saveRelease(storage, {
    manifest: manifest(),
    payload: {
      scenes: { start: scene('start', 'The published opening line.') },
      characters: [],
      audioLibrary: [],
    },
  });
}

describe('opening a release for reading', () => {
  it('loads the frozen scenes into the reader source', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    const { slice, snapshot } = createHarness(storage);

    expect(await slice.openReleaseForReading(STORY_ID)).toBe(true);
    expect(snapshot().readerRelease).toMatchObject({
      storyId: STORY_ID,
      releaseId: 'release_1',
      version: '1.0.0',
      startSceneId: 'start',
    });
  });

  it('refuses when the story has no published release', async () => {
    const { slice, snapshot } = createHarness(memoryStorage());
    expect(await slice.openReleaseForReading(STORY_ID)).toBe(false);
    expect(snapshot().readerRelease).toBeNull();
  });

  it('refuses when the payload is gone rather than opening an empty reader', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    await storage.removeItem(`vne_release_scene_${STORY_ID}_release_1_start`);

    const { slice } = createHarness(storage);
    expect(await slice.openReleaseForReading(STORY_ID)).toBe(false);
  });

  it('can open an older release by id', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    const { slice, snapshot } = createHarness(storage);

    expect(await slice.openReleaseForReading(STORY_ID, 'release_1')).toBe(true);
    expect(snapshot().readerRelease).toMatchObject({ releaseId: 'release_1' });
  });
});

// The heart of R3: an author editing after publishing changes nothing a reader
// sees, and the editor keeps seeing its own work throughout.
describe('what the reader sees while a release is open', () => {
  it('serves the frozen text, not the rewritten working copy', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    const { slice, snapshot } = createHarness(storage);
    await slice.openReleaseForReading(STORY_ID);

    expect(firstText(getReaderSceneRecord(snapshot(), STORY_ID, 'start')))
      .toBe('The published opening line.');
  });

  it('hides a scene the author added after publishing', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    const { slice, snapshot } = createHarness(storage);
    await slice.openReleaseForReading(STORY_ID);

    snapshot().sceneRecordsByStory[STORY_ID].chapter_two = scene('chapter_two', 'Written later.');

    expect(Object.keys(getReaderSceneRecordMap(snapshot(), STORY_ID))).toEqual(['start']);
  });

  it('leaves the editor on the working copy', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    const { slice, snapshot } = createHarness(storage);
    await slice.openReleaseForReading(STORY_ID);

    expect(firstText(snapshot().sceneRecordsByStory[STORY_ID].start))
      .toBe('Rewritten after publishing.');
  });

  it('falls back to the working copy once the release is closed', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    const { slice, snapshot } = createHarness(storage);
    await slice.openReleaseForReading(STORY_ID);

    slice.closeReleaseReading();

    expect(snapshot().readerRelease).toBeNull();
    expect(firstText(getReaderSceneRecord(snapshot(), STORY_ID, 'start')))
      .toBe('Rewritten after publishing.');
  });
});

// `persist` writes the whole app state on every store change, so a focus-driven
// load that always called set() meant a full write each time the author opened
// the shelf -- and, with two tabs open, a cross-tab collision on navigation
// rather than on editing.
describe('loading does not write when nothing changed', () => {
  it('leaves the state object untouched on a repeat load', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    const { slice, snapshot } = createHarness(storage);

    await slice.loadPublishedReleases();
    const afterFirst = snapshot().releaseShowcaseByStory;

    await slice.loadPublishedReleases();
    expect(snapshot().releaseShowcaseByStory).toBe(afterFirst);
  });

  it('still updates when the published release changes', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    const { slice, snapshot } = createHarness(storage);

    await slice.loadPublishedReleases();
    const afterFirst = snapshot().releaseShowcaseByStory;

    await slice.setReleasePublished(STORY_ID, 'release_1', false);
    expect(snapshot().releaseShowcaseByStory).not.toBe(afterFirst);
  });

  it('does not rewrite the listing cache for an unchanged story', async () => {
    const storage = memoryStorage();
    await storeRelease(storage);
    const { slice, snapshot } = createHarness(storage);

    await slice.loadReleasesForStory(STORY_ID);
    const afterFirst = snapshot().releasesByStory;

    await slice.loadReleasesForStory(STORY_ID);
    expect(snapshot().releasesByStory).toBe(afterFirst);
  });
});
