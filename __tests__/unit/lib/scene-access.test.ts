import {
  createInMemorySceneAccess,
  getSceneRecordFromAccess,
  getSceneRecordMapForStoryFromAccess,
  getSceneRecordsForStoryFromAccess,
  getStoryMetadataFromAccess,
} from '@/lib/scene-access';
import type { SceneRecord } from '@/lib/engine/types';

function scene(id: string, createdAt: number): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name: id,
    description: '',
    tags: [],
    timeline: [],
    sceneState: {
      backgroundAssetId: null,
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      musicTrackId: null,
      musicPlaying: false,
      musicVolume: 1,
      variables: {},
      dialogueHistory: [],
      currentChoices: null,
      isTransitioning: false,
      transitionTarget: null,
    },
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: id === 'scene-1',
    createdAt,
    updatedAt: createdAt,
  };
}

const snapshot = {
  storiesMetadata: [
    {
      id: 'story-1',
      title: 'Story',
      startSceneId: 'scene-1',
      sceneOrder: ['scene-2', 'scene-1'],
      createdAt: 1,
      updatedAt: 1,
      sceneCount: 2,
    },
  ],
  sceneRecordsByStory: {
    'story-1': {
      'scene-1': scene('scene-1', 1),
      'scene-2': scene('scene-2', 2),
      'scene-0': scene('scene-0', 0),
    },
  },
};

describe('scene access', () => {
  it('reads story metadata and individual scene records', () => {
    expect(getStoryMetadataFromAccess(snapshot, 'story-1')?.title).toBe('Story');
    expect(getSceneRecordFromAccess(snapshot, 'story-1', 'scene-2')?.id).toBe('scene-2');
    expect(getSceneRecordFromAccess(snapshot, 'story-1', 'missing')).toBeUndefined();
  });

  it('returns a stable empty map for missing stories', () => {
    expect(getSceneRecordMapForStoryFromAccess(snapshot, 'missing')).toEqual({});
  });

  it('orders records by sceneOrder first and createdAt for unordered records', () => {
    expect(getSceneRecordsForStoryFromAccess(snapshot, 'story-1').map((record) => record.id)).toEqual([
      'scene-2',
      'scene-1',
      'scene-0',
    ]);
  });

  it('creates an in-memory scene access implementation', () => {
    const access = createInMemorySceneAccess(snapshot);

    expect(access.getStoryMetadata('story-1')?.id).toBe('story-1');
    expect(access.getSceneRecord('story-1', 'scene-1')?.isStart).toBe(true);
    expect(access.getSceneRecordsForStory('story-1')).toHaveLength(3);
  });
});
