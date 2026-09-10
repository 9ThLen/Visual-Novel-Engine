import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import {
  buildShowcaseStories,
  latestSaveForStory,
  posterAssetFor,
  progressForStory,
  sceneNameFor,
  type ShowcaseSource,
} from '@/lib/showcase/showcase-adapter';
import type { ShowcaseStory } from '@/lib/showcase/story-showcase';

function scene(id: string, overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name: id,
    description: '',
    tags: [],
    timeline: [],
    sceneState: {} as never,
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const metadata: StoryMetadata = {
  id: 'story-1',
  title: 'Story',
  startSceneId: 'start',
  createdAt: 1,
  updatedAt: 2,
  sceneCount: 1,
};

describe('latestSaveForStory', () => {
  it('takes the newest slot of any kind, ignoring other stories', () => {
    const slots = [
      { storyId: 'story-1', sceneId: 'a', timestamp: 10 },
      { storyId: 'story-1', sceneId: 'quick', timestamp: 30 },
      { storyId: 'story-2', sceneId: 'other', timestamp: 99 },
      { storyId: 'story-1', sceneId: 'b', timestamp: 20 },
    ];

    expect(latestSaveForStory(slots, 'story-1')).toEqual({ sceneId: 'quick', timestamp: 30 });
    expect(latestSaveForStory(slots, 'story-3')).toBeNull();
  });
});

describe('progressForStory', () => {
  it('treats a store without ending tracking as no endings reached', () => {
    const source: ShowcaseSource = {
      storiesMetadata: [metadata],
      sceneRecordsByStory: {},
      saveSlots: [],
    };

    expect(progressForStory(source, 'story-1').endingsReached).toEqual([]);
  });

  it('reads the endings recorded for this story', () => {
    const source: ShowcaseSource = {
      storiesMetadata: [metadata],
      sceneRecordsByStory: {},
      saveSlots: [],
      endingsReachedByStory: { 'story-1': ['end-a'], 'story-2': ['end-b'] },
    };

    expect(progressForStory(source, 'story-1').endingsReached).toEqual(['end-a']);
  });
});

describe('buildShowcaseStories', () => {
  it('joins metadata, scenes and progress into one showcase story', () => {
    const stories = buildShowcaseStories({
      storiesMetadata: [metadata],
      sceneRecordsByStory: { 'story-1': { start: scene('start') } },
      saveSlots: [{ storyId: 'story-1', sceneId: 'start', timestamp: 7 }],
      endingsReachedByStory: { 'story-1': ['start'] },
    });

    expect(stories).toHaveLength(1);
    expect(stories[0].hasStarted).toBe(true);
    expect(stories[0].endingsSeen).toBe(1);
  });
});

describe('posterAssetFor', () => {
  const base = { coverUri: null, bannerBackgroundAssetId: null } as ShowcaseStory;

  it('prefers the cover, then the opening background, then nothing', () => {
    expect(posterAssetFor({ ...base, coverUri: 'cover.png', bannerBackgroundAssetId: 'bg' })).toBe('cover.png');
    expect(posterAssetFor({ ...base, bannerBackgroundAssetId: 'bg' })).toBe('bg');
    expect(posterAssetFor(base)).toBeNull();
  });
});

describe('sceneNameFor', () => {
  it('returns a real name', () => {
    expect(sceneNameFor([scene('s1', { name: 'The Hall' })], 's1')).toBe('The Hall');
  });

  it('withholds a name that is just the scene id', () => {
    expect(sceneNameFor([scene('scene_1')], 'scene_1')).toBeNull();
    expect(sceneNameFor([scene('s1', { name: '  ' })], 's1')).toBeNull();
    expect(sceneNameFor([scene('s1')], null)).toBeNull();
    expect(sceneNameFor([], 'missing')).toBeNull();
  });
});
