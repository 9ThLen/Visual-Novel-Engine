/**
 * Removal has to survive a restart.
 *
 * Story membership is not stored so much as re-derived: both migrations run on
 * every hydration and add back any asset a scene still references. That is why
 * the media library refuses to remove a file that is still used — and why the
 * only removals it does offer must be provably stable across that cycle.
 */
import { canRemoveFromStory, buildStoryMediaGallery } from '@/lib/story-media-gallery';
import { migrateStoryImageAssetIds, removeImageAssetFromStory } from '@/lib/story-image-library';
import { migrateStoryMediaAssetIds, removeMediaAssetFromStory } from '@/lib/story-media-library';
import type { Character } from '@/lib/character-types';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';

const STORY = 'story-1';

function asset(overrides: Partial<LibraryAsset> & { id: string }): LibraryAsset {
  return {
    type: 'image',
    uri: `file://${overrides.id}.png`,
    name: `${overrides.id}.png`,
    addedAt: 1,
    ...overrides,
  };
}

function scene(timeline: TimelineStep[]): SceneRecord {
  return {
    id: 'scene-1',
    storyId: STORY,
    name: 'Opening',
    description: '',
    tags: [],
    timeline,
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

const story: StoryMetadata = {
  id: STORY,
  title: 'Story',
  startSceneId: 'scene-1',
  createdAt: 1,
  updatedAt: 1,
  sceneCount: 1,
};

/** Everything hydration does to the two membership indexes, in order. */
function rehydrate(input: {
  imageAssetIdsByStory: Record<string, string[]>;
  mediaAssetIdsByStory: Record<string, string[]>;
  mediaLibrary: LibraryAsset[];
  scenes: SceneRecord[];
  characters: Character[];
}) {
  const scenesByStory = { [STORY]: Object.fromEntries(input.scenes.map((record) => [record.id, record])) };
  const imageAssetIdsByStory = migrateStoryImageAssetIds(
    input.imageAssetIdsByStory,
    scenesByStory,
    input.mediaLibrary,
  );
  const mediaAssetIdsByStory = migrateStoryMediaAssetIds({
    current: input.mediaAssetIdsByStory,
    imageAssetIdsByStory,
    stories: [story],
    scenesByStory,
    characterLibraries: { [STORY]: input.characters },
    audioLibraries: {},
    mediaLibrary: input.mediaLibrary,
  });
  return { imageAssetIdsByStory, mediaAssetIdsByStory };
}

describe('removal durability across hydration', () => {
  it('keeps an unused image removed', () => {
    const spare = asset({ id: 'spare' });
    const mediaLibrary = [spare];
    const gallery = buildStoryMediaGallery({
      storyId: STORY,
      mediaLibrary,
      imageAssetIdsByStory: { [STORY]: ['spare'] },
      mediaAssetIdsByStory: { [STORY]: ['spare'] },
      characters: [],
      scenes: [],
    });
    expect(canRemoveFromStory(gallery.images[0])).toBe(true);

    const after = rehydrate({
      imageAssetIdsByStory: removeImageAssetFromStory({ [STORY]: ['spare'] }, STORY, 'spare'),
      mediaAssetIdsByStory: removeMediaAssetFromStory({ [STORY]: ['spare'] }, STORY, 'spare'),
      mediaLibrary,
      scenes: [],
      characters: [],
    });

    expect(after.imageAssetIdsByStory[STORY] ?? []).not.toContain('spare');
    expect(after.mediaAssetIdsByStory[STORY] ?? []).not.toContain('spare');
  });

  it('keeps an unused video removed', () => {
    const clip = asset({ id: 'clip', type: 'video', uri: 'file://clip.mp4', name: 'clip.mp4' });
    const after = rehydrate({
      imageAssetIdsByStory: {},
      mediaAssetIdsByStory: removeMediaAssetFromStory({ [STORY]: ['clip'] }, STORY, 'clip'),
      mediaLibrary: [clip],
      scenes: [],
      characters: [],
    });

    expect(after.mediaAssetIdsByStory[STORY] ?? []).not.toContain('clip');
  });

  // The mirror of the unused-video case: a clip a scene still plays is put back
  // by the migration, so the gate has to refuse it.
  it('shows why a used video may not be removed: hydration restores it', () => {
    const clip = asset({ id: 'clip', type: 'video', uri: 'file://clip.mp4', name: 'clip.mp4' });
    const scenes = [scene([
      {
        id: 'step-1',
        blockType: 'video',
        enabled: true,
        data: { mode: 'play', layer: 'background', assetId: 'clip', posterAssetId: null },
      } as TimelineStep,
    ])];
    const gallery = buildStoryMediaGallery({
      storyId: STORY,
      mediaLibrary: [clip],
      imageAssetIdsByStory: {},
      mediaAssetIdsByStory: { [STORY]: ['clip'] },
      characters: [],
      scenes,
    });
    expect(gallery.videos[0].usage.enabled).toBe(1);
    expect(canRemoveFromStory(gallery.videos[0])).toBe(false);

    const after = rehydrate({
      imageAssetIdsByStory: {},
      mediaAssetIdsByStory: removeMediaAssetFromStory({ [STORY]: ['clip'] }, STORY, 'clip'),
      mediaLibrary: [clip],
      scenes,
      characters: [],
    });

    expect(after.mediaAssetIdsByStory[STORY]).toContain('clip');
  });

  // The gate exists because of exactly this: the migration puts a referenced
  // asset straight back, so a "successful" removal would undo itself on restart.
  it('shows why a used image may not be removed: hydration restores it', () => {
    const bg = asset({ id: 'bg' });
    const scenes = [scene([
      { id: 'step-1', blockType: 'background', enabled: true, data: { assetId: 'bg' } } as TimelineStep,
    ])];
    const gallery = buildStoryMediaGallery({
      storyId: STORY,
      mediaLibrary: [bg],
      imageAssetIdsByStory: { [STORY]: ['bg'] },
      mediaAssetIdsByStory: { [STORY]: ['bg'] },
      characters: [],
      scenes,
    });
    expect(canRemoveFromStory(gallery.images[0])).toBe(false);

    const after = rehydrate({
      imageAssetIdsByStory: removeImageAssetFromStory({ [STORY]: ['bg'] }, STORY, 'bg'),
      mediaAssetIdsByStory: removeMediaAssetFromStory({ [STORY]: ['bg'] }, STORY, 'bg'),
      mediaLibrary: [bg],
      scenes,
      characters: [],
    });

    expect(after.imageAssetIdsByStory[STORY]).toContain('bg');
  });

  // Same reason for a character-owned file: the sprite's URI re-adds it.
  it('shows why a character-owned image may not be removed: the sprite restores it', () => {
    const shared = asset({ id: 'a1', uri: 'file://alice.png' });
    const characters: Character[] = [{
      id: 'alice',
      name: 'Alice',
      createdAt: 1,
      sprites: [{ id: 'happy', name: 'Happy', uri: 'file://alice.png', createdAt: 1 }],
    }];
    const gallery = buildStoryMediaGallery({
      storyId: STORY,
      mediaLibrary: [shared],
      imageAssetIdsByStory: { [STORY]: ['a1'] },
      mediaAssetIdsByStory: { [STORY]: ['a1'] },
      characters,
      scenes: [],
    });
    expect(canRemoveFromStory(gallery.images[0])).toBe(false);

    const after = rehydrate({
      imageAssetIdsByStory: removeImageAssetFromStory({ [STORY]: ['a1'] }, STORY, 'a1'),
      mediaAssetIdsByStory: removeMediaAssetFromStory({ [STORY]: ['a1'] }, STORY, 'a1'),
      mediaLibrary: [shared],
      scenes: [],
      characters,
    });

    expect(after.mediaAssetIdsByStory[STORY]).toContain('a1');
  });
});
