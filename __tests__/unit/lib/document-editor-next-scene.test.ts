import {
  connectSourceToNext,
  createNextSceneRecordAfter,
  insertSceneAfter,
} from '@/lib/document-editor/next-scene';
import type { SceneRecord } from '@/lib/engine/types';

function scene(id: string, overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id,
    storyId: 'story_1',
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
    flowX: 10,
    flowY: 20,
    connections: [],
    isStart: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('next scene helpers', () => {
  it('inserts a scene id after source', () => {
    expect(insertSceneAfter(['a', 'b', 'c'], 'b', 'next')).toEqual(['a', 'b', 'next', 'c']);
  });

  it('replaces existing next connection without duplicating choice connections', () => {
    const records = connectSourceToNext([
      scene('a', {
        connections: [
          { targetSceneId: 'old', outputPort: 'next', label: 'Old' },
          { targetSceneId: 'choice_target', outputPort: 'choice_1', label: 'Choice' },
        ],
      }),
      scene('next'),
    ], 'a', 'next');

    expect(records[0].connections).toEqual([
      { targetSceneId: 'choice_target', outputPort: 'choice_1', label: 'Choice' },
      { targetSceneId: 'next', outputPort: 'next', label: 'Next' },
    ]);
  });

  it('creates a valid positioned next scene', () => {
    const created = createNextSceneRecordAfter(scene('source'), [scene('source')]);

    expect(created.id).toMatch(/^scene_/);
    expect(created.storyId).toBe('story_1');
    expect(created.name).toBe('Scene 2');
    expect(created.flowX).toBe(370);
    expect(created.flowY).toBe(20);
    expect(created.isStart).toBe(false);
  });
});
