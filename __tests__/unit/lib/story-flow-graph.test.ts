import { describe, expect, it } from 'vitest';

import type { SceneRecord } from '@/lib/engine/types';
import { buildStoryFlowGraph } from '@/lib/story-flow-graph';

function makeSceneRecord(overrides = {}): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Scene 1',
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
    isStart: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('story-flow-graph', () => {
  it('derives canonical nodes and edges from persisted scene records', () => {
    const graph = buildStoryFlowGraph(
      {
        storiesMetadata: [
          {
            id: 'story-1',
            title: 'Story',
            startSceneId: 'scene-1',
            createdAt: 1,
            updatedAt: 1,
            sceneCount: 2,
          },
        ],
        sceneRecordsByStory: {
          'story-1': {
            'scene-1': makeSceneRecord({
              id: 'scene-1',
              isStart: true,
              connections: [{ targetSceneId: 'scene-2', outputPort: 'next' }],
            }),
            'scene-2': makeSceneRecord({
              id: 'scene-2',
              createdAt: 2,
              updatedAt: 2,
            }),
          },
        },
      },
      'story-1'
    );

    expect(graph.startSceneId).toBe('scene-1');
    expect(graph.nodes.map((node) => node.id)).toEqual(['scene-1', 'scene-2']);
    expect(graph.edges).toEqual([
      {
        id: 'scene-1:next:scene-2',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
        outputPort: 'next',
        label: '',
      },
    ]);
  });

  it('preserves persisted zero coordinates instead of falling back to placeholder positions', () => {
    const graph = buildStoryFlowGraph(
      {
        storiesMetadata: [
          {
            id: 'story-1',
            title: 'Story',
            startSceneId: 'scene-1',
            createdAt: 1,
            updatedAt: 1,
            sceneCount: 1,
          },
        ],
        sceneRecordsByStory: {
          'story-1': {
            'scene-1': makeSceneRecord({
              id: 'scene-1',
              flowX: 0,
              flowY: 0,
              isStart: true,
            }),
          },
        },
      },
      'story-1'
    );

    expect(graph.nodes[0]).toMatchObject({
      id: 'scene-1',
      x: 0,
      y: 0,
      isStart: true,
    });
  });
});
