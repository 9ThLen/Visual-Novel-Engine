import { computeOrphanedByDeletion, startBranchScene } from '@/lib/document-editor/branch-actions';
import type { ChoiceBlockData, ChoiceOption, SceneRecord, TimelineStep } from '@/lib/engine/types';

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

function choiceStep(
  id: string,
  options: ChoiceOption[],
  overrides: Partial<TimelineStep> = {},
): TimelineStep {
  return {
    id,
    blockType: 'choice',
    data: { options },
    collapsed: false,
    enabled: true,
    ...overrides,
  };
}

describe('startBranchScene', () => {
  it('creates a new scene and points the empty option at it (timeline + connection)', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_1', text: 'Ліворуч', targetSceneId: null },
            { id: 'opt_2', text: 'Праворуч', targetSceneId: null },
          ]),
        ],
      }),
    ];

    const result = startBranchScene(scenes, 'choice_1', 'opt_2');

    expect(result).toBeDefined();
    const { newScene, updatedSourceScene } = result!;
    expect(newScene.storyId).toBe('story_1');
    expect(newScene.timeline).toEqual([]);

    const step = updatedSourceScene.timeline[0];
    const data = step.data as ChoiceBlockData;
    expect(data.options.find((o) => o.id === 'opt_2')?.targetSceneId).toBe(newScene.id);
    expect(data.options.find((o) => o.id === 'opt_1')?.targetSceneId).toBeNull();

    const connection = updatedSourceScene.connections.find((c) => c.outputPort === 'opt_2');
    expect(connection).toEqual({ targetSceneId: newScene.id, outputPort: 'opt_2', label: 'Праворуч' });
  });

  it('keeps the next connection and other option connections intact', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_1', text: 'One', targetSceneId: 'b' },
            { id: 'opt_2', text: 'Two', targetSceneId: null },
          ]),
        ],
        connections: [
          { targetSceneId: 'b', outputPort: 'opt_1', label: 'One' },
          { targetSceneId: 'b', outputPort: 'next', label: 'Next' },
        ],
      }),
      scene('b'),
    ];

    const result = startBranchScene(scenes, 'choice_1', 'opt_2');

    expect(result).toBeDefined();
    const connections = result!.updatedSourceScene.connections;
    expect(connections).toContainEqual({ targetSceneId: 'b', outputPort: 'opt_1', label: 'One' });
    expect(connections).toContainEqual({ targetSceneId: 'b', outputPort: 'next', label: 'Next' });
    expect(connections.filter((c) => c.outputPort === 'opt_2')).toHaveLength(1);
  });

  it('replaces a dangling explicit target instead of refusing', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [{ id: 'opt_1', text: 'One', targetSceneId: 'ghost' }]),
        ],
        connections: [{ targetSceneId: 'ghost', outputPort: 'opt_1', label: 'One' }],
      }),
    ];

    const result = startBranchScene(scenes, 'choice_1', 'opt_1');

    expect(result).toBeDefined();
    const data = result!.updatedSourceScene.timeline[0].data as ChoiceBlockData;
    expect(data.options[0].targetSceneId).toBe(result!.newScene.id);
    expect(result!.updatedSourceScene.connections.filter((c) => c.outputPort === 'opt_1')).toHaveLength(1);
  });

  it('refuses when the option already has a working explicit target', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [{ id: 'opt_1', text: 'One', targetSceneId: 'b' }]),
        ],
      }),
      scene('b'),
    ];

    expect(startBranchScene(scenes, 'choice_1', 'opt_1')).toBeUndefined();
  });

  it('returns undefined for an unknown choice step or option', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [choiceStep('choice_1', [{ id: 'opt_1', text: 'One', targetSceneId: null }])],
      }),
    ];

    expect(startBranchScene(scenes, 'missing', 'opt_1')).toBeUndefined();
    expect(startBranchScene(scenes, 'choice_1', 'missing')).toBeUndefined();
  });

  it('does not mutate the input scenes', () => {
    const source = scene('a', {
      isStart: true,
      timeline: [choiceStep('choice_1', [{ id: 'opt_1', text: 'One', targetSceneId: null }])],
    });
    const snapshot = JSON.parse(JSON.stringify(source));

    startBranchScene([source], 'choice_1', 'opt_1');

    expect(source).toEqual(snapshot);
  });
});

describe('computeOrphanedByDeletion', () => {
  it('reports the tail that only the deleted scene reaches', () => {
    const scenes = [
      scene('a', { isStart: true, connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      scene('b', { connections: [{ targetSceneId: 'c', outputPort: 'next' }] }),
      scene('c'),
    ];

    expect(computeOrphanedByDeletion(scenes, 'b').map((s) => s.id)).toEqual(['c']);
  });

  it('does not report scenes still reachable through another branch', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [choiceStep('choice_1', [{ id: 'opt_1', text: 'One', targetSceneId: 'c' }])],
        connections: [
          { targetSceneId: 'b', outputPort: 'next' },
          { targetSceneId: 'c', outputPort: 'opt_1' },
        ],
      }),
      scene('b', { connections: [{ targetSceneId: 'd', outputPort: 'next' }] }),
      scene('c', { connections: [{ targetSceneId: 'd', outputPort: 'next' }] }),
      scene('d'),
    ];

    expect(computeOrphanedByDeletion(scenes, 'b').map((s) => s.id)).toEqual([]);
  });

  it('follows explicit choice targets when computing reachability', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [choiceStep('choice_1', [{ id: 'opt_1', text: 'One', targetSceneId: 'b' }])],
      }),
      scene('b', { connections: [{ targetSceneId: 'c', outputPort: 'next' }] }),
      scene('c'),
    ];

    expect(computeOrphanedByDeletion(scenes, 'b').map((s) => s.id)).toEqual(['c']);
  });

  it('ignores scenes that were already unreachable', () => {
    const scenes = [
      scene('a', { isStart: true, connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      scene('b'),
      scene('orphan'),
    ];

    expect(computeOrphanedByDeletion(scenes, 'b').map((s) => s.id)).toEqual([]);
  });

  it('returns an empty list when deleting the start scene', () => {
    const scenes = [
      scene('a', { isStart: true, connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      scene('b'),
    ];

    expect(computeOrphanedByDeletion(scenes, 'a')).toEqual([]);
  });
});
