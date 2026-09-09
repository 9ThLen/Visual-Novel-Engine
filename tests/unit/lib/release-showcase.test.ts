import {
  buildShowcaseStoryFromRelease,
  releaseShowcaseSource,
  type ReleaseShowcaseSource,
} from '@/lib/showcase/release-showcase';
import { buildShowcaseStoriesFromReleases } from '@/lib/showcase/showcase-adapter';
import { parseReleaseManifest } from '@/lib/release/manifest';
import type { ReleaseManifestV1 } from '@/lib/release/types';

const PAYLOAD_HASH = 'a'.repeat(64);

function manifest(overrides: Record<string, unknown> = {}): ReleaseManifestV1 {
  return parseReleaseManifest({
    format: 'vne-release',
    containerVersion: 1,
    schemaVersion: 1,
    createdAt: '2026-08-29T10:00:00.000Z',
    appVersion: '1.0.0',
    story: {
      id: 'story_1',
      title: 'A Published Novel',
      startSceneId: 'scene_1',
      createdAt: 1_000,
      updatedAt: 2_000,
      sceneCount: 3,
      tags: ['mystery', 'short'],
    },
    release: {
      releaseId: 'release_1',
      storyId: 'story_1',
      version: '1.2.0',
      channel: 'both',
      releasedAt: '2026-08-29T10:00:00.000Z',
      notes: 'Fixed the museum door.',
      engineVersion: '1.0.0',
      minEngineVersion: '1.0.0',
      payloadHash: PAYLOAD_HASH,
      presentation: { coverAssetId: 'idb-media://cover', bannerEffect: 'rain' },
      publication: { author: '  A Writer  ', languages: ['uk'], contentRating: 'teen' },
      stats: { scenes: 3, words: 900, readMinutes: 5, endings: 2, branches: 4 },
      showcase: {
        teaser: 'A door opens onto a quiet room.',
        bannerBackgroundAssetId: 'idb-media://hall',
        terminalSceneIds: ['scene_2', 'scene_3'],
      },
      ...overrides,
    },
    counts: { scenes: 3, characters: 0, audioItems: 0, embeddedAssets: 0, totalAssetBytes: 0 },
    payload: { archivePath: 'story.json', sha256: PAYLOAD_HASH, size: 512 },
    assets: [],
  });
}

const noProgress = { latestSave: null, endingsReached: [] };

describe('releaseShowcaseSource', () => {
  it('flattens what a card needs out of the manifest', () => {
    const source = releaseShowcaseSource(manifest());
    expect(source).toMatchObject({
      storyId: 'story_1',
      releaseId: 'release_1',
      version: '1.2.0',
      title: 'A Published Novel',
      author: 'A Writer',
      coverUri: 'idb-media://cover',
      teaser: 'A door opens onto a quiet room.',
      tags: ['mystery', 'short'],
      readMinutes: 5,
      branchCount: 4,
      bannerEffect: 'rain',
      bannerBackgroundAssetId: 'idb-media://hall',
      notes: 'Fixed the museum door.',
    });
  });

  // A shelf that reordered itself while an author edited a draft would be
  // reporting private work in public.
  it('dates a card by its release, not by the story it was cut from', () => {
    expect(releaseShowcaseSource(manifest()).updatedAt)
      .toBe(Date.parse('2026-08-29T10:00:00.000Z'));
  });

  it('keeps the story\'s own creation date', () => {
    expect(releaseShowcaseSource(manifest()).createdAt).toBe(1_000);
  });

  it('reports a blank author as none rather than as whitespace', () => {
    const source = releaseShowcaseSource(manifest({
      publication: { author: '   x', languages: ['uk'], contentRating: 'teen' },
    }));
    expect(source.author).toBe('x');
  });

  it('omits notes when the release had none', () => {
    const raw = manifest();
    delete (raw.release as { notes?: string }).notes;
    expect('notes' in releaseShowcaseSource(raw)).toBe(false);
  });
});

describe('buildShowcaseStoryFromRelease', () => {
  const source = releaseShowcaseSource(manifest());

  it('draws a card with no scenes loaded', () => {
    const story = buildShowcaseStoryFromRelease(source, noProgress);
    expect(story).toMatchObject({
      id: 'story_1',
      title: 'A Published Novel',
      teaser: 'A door opens onto a quiet room.',
      endingsTotal: 2,
      endingsSeen: 0,
      hasStarted: false,
      isFinished: false,
    });
  });

  it('counts only the endings this release actually has', () => {
    const story = buildShowcaseStoryFromRelease(source, {
      latestSave: null,
      // scene_9 belonged to an older release and must not count.
      endingsReached: ['scene_2', 'scene_9', 'scene_2'],
    });
    expect(story.endingsSeen).toBe(1);
    expect(story.isFinished).toBe(true);
  });

  it('carries the reader\'s position', () => {
    const story = buildShowcaseStoryFromRelease(source, {
      latestSave: { sceneId: 'scene_2', timestamp: 5_000 },
      endingsReached: [],
    });
    expect(story).toMatchObject({
      hasStarted: true,
      lastSceneId: 'scene_2',
      lastSaveTimestamp: 5_000,
    });
  });

  // Same display floor as the draft showcase: a story that loops back to its
  // own beginning still stops somewhere for the reader.
  it('never claims a story has no ending at all', () => {
    const looping: ReleaseShowcaseSource = { ...source, terminalSceneIds: [] };
    expect(buildShowcaseStoryFromRelease(looping, noProgress).endingsTotal).toBe(1);
  });
});

describe('buildShowcaseStoriesFromReleases', () => {
  it('builds one card per published release', () => {
    const stories = buildShowcaseStoriesFromReleases(
      [releaseShowcaseSource(manifest())],
      { saveSlots: [], endingsReachedByStory: {} },
    );
    expect(stories).toHaveLength(1);
    expect(stories[0].title).toBe('A Published Novel');
  });

  it('shows nothing when nothing is published', () => {
    expect(buildShowcaseStoriesFromReleases([], { saveSlots: [] })).toEqual([]);
  });

  it('matches each release to its own reader progress', () => {
    const other = releaseShowcaseSource(manifest());
    const stories = buildShowcaseStoriesFromReleases(
      [{ ...other, storyId: 'story_a' }, { ...other, storyId: 'story_b' }],
      {
        saveSlots: [{ storyId: 'story_b', sceneId: 'scene_2', timestamp: 9_000 }],
        endingsReachedByStory: { story_b: ['scene_3'] },
      },
    );
    expect(stories[0]).toMatchObject({ hasStarted: false, endingsSeen: 0 });
    expect(stories[1]).toMatchObject({ hasStarted: true, endingsSeen: 1 });
  });

  it('survives a missing progress map', () => {
    const stories = buildShowcaseStoriesFromReleases(
      [releaseShowcaseSource(manifest())],
      { saveSlots: [] },
    );
    expect(stories[0].endingsSeen).toBe(0);
  });
});
