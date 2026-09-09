/**
 * The two answers the redesigned library gives that no single file can: what
 * the story's media adds up to, and the order the browser lays it out in.
 *
 * Both are built from real gallery items rather than hand-written ones, so a
 * disagreement with `buildStoryMediaGallery` about what an item looks like
 * fails here rather than on screen.
 */
import { sortMediaItems } from '@/lib/media-browser-rows';
import { summarizeStoryMedia } from '@/lib/media-library-overview';
import { buildStoryMediaGallery, type StoryMediaItem } from '@/lib/story-media-gallery';
import type { Character } from '@/lib/character-types';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

const DAY = 86_400_000;
const NOW = new Date('2026-08-24T12:00:00Z').getTime();

function asset(overrides: Partial<LibraryAsset> & { id: string }): LibraryAsset {
  return {
    type: 'image',
    uri: `file://${overrides.id}.png`,
    name: `${overrides.id}.png`,
    addedAt: NOW,
    ...overrides,
  };
}

function step(id: string, blockType: TimelineStep['blockType'], data: unknown): TimelineStep {
  return { id, blockType, data, enabled: true, collapsed: false } as TimelineStep;
}

function scene(timeline: TimelineStep[]): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
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

/** A sprite whose file never entered the media library: no size on record. */
const alice: Character = {
  id: 'alice',
  name: 'Alice',
  color: '#ff0000',
  createdAt: 1,
  sprites: [{ id: 'happy', name: 'Happy', uri: 'file://alice.png', createdAt: NOW - 5 * DAY }],
};

function gallery() {
  return buildStoryMediaGallery({
    storyId: 'story-1',
    mediaLibrary: [
      asset({ id: 'room', size: 300, addedAt: NOW }),
      asset({ id: 'spare', size: 100, addedAt: NOW - 2 * DAY }),
      asset({ id: 'clip', type: 'video', uri: 'file://clip.mp4', name: 'clip.mp4', size: 900, addedAt: NOW - DAY }),
      asset({ id: 'bgm', type: 'audio', uri: 'file://bgm.mp3', name: 'bgm.mp3', size: 50, addedAt: NOW - 3 * DAY }),
    ],
    imageAssetIdsByStory: { 'story-1': ['room', 'spare'] },
    mediaAssetIdsByStory: { 'story-1': ['clip', 'bgm'] },
    characters: [alice],
    scenes: [scene([step('b1', 'background', { assetId: 'room' })])],
  });
}

describe('story media summary', () => {
  it('counts every kind and weighs only the files it has a size for', () => {
    const summary = summarizeStoryMedia(gallery());

    // Two library images plus Alice's sprite, which is an image of this story
    // without being an entry in the media library.
    expect(summary.counts).toEqual({ image: 3, video: 1, audio: 1, total: 5 });
    expect(summary.bytes).toEqual({ image: 400, video: 900, audio: 50, total: 1350 });
    // A bar drawn from four files must not be presented as covering five.
    expect(summary.unsizedCount).toBe(1);
  });

  it('adds up what nothing in the story points at', () => {
    const summary = summarizeStoryMedia(gallery());

    // Everything but the background the one scene uses.
    expect(summary.unused.count).toBe(4);
    // The sprite among them contributes no bytes, because none are recorded.
    expect(summary.unused.bytes).toBe(1050);
  });

  it('lists the newest files across every kind, not per kind', () => {
    const summary = summarizeStoryMedia(gallery());

    // Image, then video, then image: kinds do not take turns, dates decide.
    expect(summary.recent.map((item) => item.name)).toEqual(['room.png', 'clip.mp4', 'spare.png']);
  });

  it('has something to say about a story with no media at all', () => {
    const empty = summarizeStoryMedia(buildStoryMediaGallery({
      storyId: 'story-1',
      mediaLibrary: [],
      imageAssetIdsByStory: {},
      mediaAssetIdsByStory: {},
      characters: [],
      scenes: [],
    }));

    expect(empty.counts.total).toBe(0);
    expect(empty.bytes.total).toBe(0);
    expect(empty.recent).toEqual([]);
    expect(empty.unused).toEqual({ count: 0, bytes: 0 });
  });
});

describe('browser sort order', () => {
  const items = () => [...gallery().images, ...gallery().videos, ...gallery().audios];

  // The gallery is already newest-first, and the date headers describe that
  // order; re-sorting it would only risk disagreeing with them.
  it('leaves the default order exactly as the gallery built it', () => {
    const original = items();
    expect(sortMediaItems(original, 'date')).toBe(original);
  });

  it('sorts by name and by size, heaviest first', () => {
    expect(sortMediaItems(items(), 'name').map((item) => item.name))
      .toEqual(['bgm.mp3', 'clip.mp4', 'Happy', 'room.png', 'spare.png']);

    expect(sortMediaItems(items(), 'size').map((item) => item.name))
      .toEqual(['clip.mp4', 'room.png', 'spare.png', 'bgm.mp3', 'Happy']);
  });

  // A file with no recorded size is not a file of zero bytes: sorting it as one
  // would float every unweighed sprite above the real answers.
  it('puts a file of unknown size last rather than treating it as empty', () => {
    const sorted = sortMediaItems(items(), 'size');
    expect(sorted[sorted.length - 1].name).toBe('Happy');
  });

  it('sorts by how much the story leans on a file, newest first among equals', () => {
    const sorted: StoryMediaItem[] = sortMediaItems(items(), 'usage');

    expect(sorted[0].name).toBe('room.png');
    expect(sorted.slice(1).every((item) => item.usage.enabled + item.usage.disabled === 0)).toBe(true);
    expect(sorted.slice(1).map((item) => item.addedAt))
      .toEqual([...sorted.slice(1).map((item) => item.addedAt)].sort((left, right) => right - left));
  });
});
