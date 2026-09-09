import { compileRelease, MIN_ENGINE_VERSION_FOR_RELEASE_V1 } from '@/lib/release/compile';
import { parseReleaseManifest } from '@/lib/release/manifest';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { useAppStore } from '@/stores/use-app-store';

const STORY_ID = 'release-compile-story';
const COVER_URI = 'data:image/png;base64,AQID';

function timeline(): TimelineStep[] {
  return [
    {
      id: 'kept-text',
      blockType: 'text',
      collapsed: false,
      enabled: true,
      data: { content: 'The museum door creaks open before you.' },
    },
    {
      id: 'disabled-draft',
      blockType: 'text',
      collapsed: false,
      enabled: false,
      data: { content: 'TODO rewrite this whole bit, it is terrible' },
    },
    {
      id: 'rain',
      blockType: 'effect',
      collapsed: false,
      enabled: true,
      data: { effectType: 'rain' },
    },
  ] as unknown as TimelineStep[];
}

function scene(id: string, isStart = false): SceneRecord {
  return {
    id,
    storyId: STORY_ID,
    name: id,
    description: '',
    tags: [],
    isStart,
    connections: [],
    timeline: timeline(),
    sceneState: {
      characters: [],
      activeEffects: [],
      soundEvents: [],
    },
  } as unknown as SceneRecord;
}

function metadata(overrides: Partial<StoryMetadata> = {}): StoryMetadata {
  return {
    id: STORY_ID,
    title: 'A Compiled Novel',
    description: 'Short and finished.',
    author: 'A Writer',
    startSceneId: 'start',
    createdAt: 1,
    updatedAt: 2,
    sceneCount: 2,
    thumbnailUri: COVER_URI,
    contentRating: 'teen',
    languages: ['uk', 'en'],
    licence: 'CC-BY-4.0',
    aiAssisted: false,
    ...overrides,
  };
}

function seedStore(story: StoryMetadata = metadata()): () => void {
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
  return () => useAppStore.setState(before, true);
}

const baseInput = {
  storyId: STORY_ID,
  version: '1.0.0',
  channel: 'both' as const,
  engineVersion: '1.0.0',
  releaseId: 'release_fixed',
  releasedAt: '2026-08-29T10:00:00.000Z',
};

describe('compileRelease', () => {
  let restore: () => void;
  beforeEach(() => { restore = seedStore(); });
  afterEach(() => restore());

  it('produces a manifest its own parser accepts', async () => {
    const compiled = await compileRelease(baseInput);
    expect(() => parseReleaseManifest(JSON.parse(JSON.stringify(compiled.manifest)))).not.toThrow();
  });

  it('carries the release identity it was given', async () => {
    const { manifest } = await compileRelease({ ...baseInput, notes: '  First cut.  ' });
    expect(manifest.release.releaseId).toBe('release_fixed');
    expect(manifest.release.version).toBe('1.0.0');
    expect(manifest.release.channel).toBe('both');
    expect(manifest.release.releasedAt).toBe('2026-08-29T10:00:00.000Z');
    expect(manifest.release.notes).toBe('First cut.');
    expect(manifest.release.minEngineVersion).toBe(MIN_ENGINE_VERSION_FOR_RELEASE_V1);
  });

  it('omits blank notes rather than storing an empty string', async () => {
    const { manifest } = await compileRelease({ ...baseInput, notes: '   ' });
    expect('notes' in manifest.release).toBe(false);
  });

  // A disabled step is the author's "not this, not yet". It is invisible to a
  // reader either way, so shipping it would only leak drafts into a file handed
  // to strangers.
  it('drops disabled timeline steps from the frozen story', async () => {
    const { payload, payloadBytes } = await compileRelease(baseInput);
    const steps = payload.scenes.start.timeline;
    expect(steps.map((step) => step.id)).toEqual(['kept-text', 'rain']);
    expect(new TextDecoder().decode(payloadBytes)).not.toContain('TODO rewrite');
  });

  it('leaves the working copy untouched', async () => {
    await compileRelease(baseInput);
    const live = useAppStore.getState().sceneRecordsByStory[STORY_ID].start;
    expect(live.timeline).toHaveLength(3);
  });

  it('counts stats from the frozen story, not the draft', async () => {
    const { manifest } = await compileRelease(baseInput);
    expect(manifest.release.stats.scenes).toBe(2);
    expect(manifest.counts.scenes).toBe(2);
    expect(manifest.release.stats.words).toBeGreaterThan(0);
    expect(new TextDecoder().decode((await compileRelease(baseInput)).payloadBytes))
      .not.toContain('terrible');
  });

  it('hashes the exact payload bytes it returns', async () => {
    const compiled = await compileRelease(baseInput);
    expect(compiled.manifest.payload.size).toBe(compiled.payloadBytes.byteLength);
    expect(compiled.manifest.payload.sha256).toBe(compiled.manifest.release.payloadHash);
  });

  // Content is deterministic; identifiers are not. `captureStoryBackup` mints a
  // fresh assetId for a reference that is not in the media library, so two
  // compiles of one story agree on every hash, byte count and statistic while
  // labelling those assets differently. That is enough for artifact
  // verification, which checks hashes -- but it does mean a release is not
  // byte-reproducible, and anything that comes to depend on that will have to
  // derive those ids from content instead.
  it('produces identical content for the same story and inputs', async () => {
    const first = await compileRelease(baseInput);
    const second = await compileRelease(baseInput);

    expect(second.payloadBytes).toEqual(first.payloadBytes);
    expect(second.manifest.payload).toEqual(first.manifest.payload);
    expect(second.manifest.counts).toEqual(first.manifest.counts);
    expect(second.manifest.release.stats).toEqual(first.manifest.release.stats);
    expect(second.manifest.assets.map((asset) => asset.sha256))
      .toEqual(first.manifest.assets.map((asset) => asset.sha256));
  });

  it('freezes the publication facts', async () => {
    const { manifest } = await compileRelease(baseInput);
    expect(manifest.release.publication).toEqual({
      author: 'A Writer',
      languages: ['uk', 'en'],
      contentRating: 'teen',
      licence: 'CC-BY-4.0',
      aiAssisted: false,
    });
  });

  it('captures the cover and the opening effect as presentation', async () => {
    const { manifest } = await compileRelease(baseInput);
    expect(manifest.release.presentation?.coverAssetId).toBe(COVER_URI);
    expect(manifest.release.presentation?.bannerEffect).toBe('rain');
  });

  it('embeds the cover as an asset', async () => {
    const { manifest } = await compileRelease(baseInput);
    expect(manifest.counts.embeddedAssets).toBe(manifest.assets.length);
    expect(manifest.assets.some((asset) => asset.sourceReferences.includes(COVER_URI))).toBe(true);
  });

  it('totals asset bytes to match the asset table', async () => {
    const { manifest } = await compileRelease(baseInput);
    expect(manifest.counts.totalAssetBytes)
      .toBe(manifest.assets.reduce((total, asset) => total + asset.size, 0));
  });

  it.each([
    ['an author', { author: '' }],
    ['a language', { languages: undefined }],
    ['a content rating', { contentRating: undefined }],
  ])('refuses to compile without %s', async (_label, overrides) => {
    restore();
    restore = seedStore(metadata(overrides));
    await expect(compileRelease(baseInput)).rejects.toThrow(/Cannot compile a release without/);
  });

  it('names every missing publication fact at once', async () => {
    restore();
    restore = seedStore(metadata({ author: '', languages: undefined, contentRating: undefined }));
    await expect(compileRelease(baseInput))
      .rejects.toThrow(/author, languages, content rating/);
  });

  it('rejects an unknown story', async () => {
    await expect(compileRelease({ ...baseInput, storyId: 'nobody' })).rejects.toThrow(/Unknown story/);
  });
});
