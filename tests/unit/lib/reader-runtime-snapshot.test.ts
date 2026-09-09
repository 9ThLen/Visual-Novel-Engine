import {
  buildPrefetchedReaderRuntimeSnapshot,
  buildScopedReaderRuntimeSnapshot,
} from '@/lib/reader-runtime-snapshot';
import type { SceneRecord } from '@/lib/engine/types';

function makeSceneRecord(id: string, storyId = 'story-1'): SceneRecord {
  return {
    id,
    storyId,
    name: `Scene ${id}`,
    description: '',
    tags: [],
    timeline: [
      {
        id: `text-${id}`,
        blockType: 'text',
        data: {
          content: `Text for ${id}`,
          typewriterSpeed: 0.5,
          anchorTo: 'background',
        },
        collapsed: false,
        enabled: true,
      },
    ],
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
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('buildScopedReaderRuntimeSnapshot', () => {
  it('includes only the requested story metadata and scene record', () => {
    const snapshot = buildScopedReaderRuntimeSnapshot(
      {
        storiesMetadata: [
          {
            id: 'story-1',
            title: 'Active story',
            startSceneId: 'scene-1',
            createdAt: 1,
            updatedAt: 1,
            sceneCount: 2,
          },
          {
            id: 'story-2',
            title: 'Other story',
            startSceneId: 'scene-a',
            createdAt: 1,
            updatedAt: 1,
            sceneCount: 1,
          },
        ],
        sceneRecordsByStory: {
          'story-1': {
            'scene-1': makeSceneRecord('scene-1'),
            'scene-2': makeSceneRecord('scene-2'),
          },
          'story-2': {
            'scene-a': makeSceneRecord('scene-a', 'story-2'),
          },
        },
      },
      'story-1',
      'scene-2',
    );

    expect(snapshot.storiesMetadata.map((story) => story.id)).toEqual(['story-1']);
    expect(Object.keys(snapshot.sceneRecordsByStory)).toEqual(['story-1']);
    expect(Object.keys(snapshot.sceneRecordsByStory['story-1'])).toEqual(['scene-2']);
    expect(snapshot.sceneRecordsByStory['story-1']['scene-2'].timeline[0].id).toBe('text-scene-2');
  });

  it('returns an empty scene map when the requested scene is unavailable', () => {
    const snapshot = buildScopedReaderRuntimeSnapshot(
      {
        storiesMetadata: [
          {
            id: 'story-1',
            title: 'Active story',
            startSceneId: 'scene-1',
            createdAt: 1,
            updatedAt: 1,
            sceneCount: 1,
          },
        ],
        sceneRecordsByStory: {
          'story-1': {
            'scene-1': makeSceneRecord('scene-1'),
          },
        },
      },
      'story-1',
      'missing-scene',
    );

    expect(snapshot.storiesMetadata.map((story) => story.id)).toEqual(['story-1']);
    expect(snapshot.sceneRecordsByStory).toEqual({});
  });

  it('can include directly reachable scenes for reader prefetch snapshots', () => {
    const state = {
      storiesMetadata: [
        {
          id: 'story-1',
          title: 'Active story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 3,
        },
      ],
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': {
            ...makeSceneRecord('scene-1'),
            connections: [{ targetSceneId: 'scene-2', outputPort: 'next' }],
          },
          'scene-2': makeSceneRecord('scene-2'),
          'scene-3': makeSceneRecord('scene-3'),
        },
      },
    };

    const snapshot = buildPrefetchedReaderRuntimeSnapshot(state, 'story-1', 'scene-1');

    expect(Object.keys(snapshot.sceneRecordsByStory['story-1'])).toEqual(['scene-1', 'scene-2']);
  });
});
