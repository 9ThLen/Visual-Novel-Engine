import { expandActivePath } from '@/lib/document-editor/story-path';
import type { ChoiceOption, SceneRecord, TimelineStep } from '@/lib/engine/types';

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

describe('expandActivePath', () => {
  it('follows next connections from the isStart scene in a linear story', () => {
    const scenes = [
      scene('a', { isStart: true, connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      scene('b', { connections: [{ targetSceneId: 'c', outputPort: 'next' }] }),
      scene('c'),
    ];

    const result = expandActivePath(scenes);

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(result.offPathScenes).toEqual([]);
  });

  it('starts from scenes[0] when no scene has isStart', () => {
    const scenes = [
      scene('a', { connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      scene('b'),
    ];

    const result = expandActivePath(scenes);

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('follows the selected option explicit target and records branch/viaChoice metadata', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_a', text: 'Go left', targetSceneId: 'left' },
            { id: 'opt_b', text: 'Go right', targetSceneId: 'right' },
          ]),
        ],
      }),
      scene('left'),
      scene('right'),
    ];

    const result = expandActivePath(scenes, { choice_1: 'opt_b' });

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'right']);
    expect(result.branchInfoByChoiceStepId.choice_1.selectedOptionId).toBe('opt_b');
    expect(result.metadataBySceneId.right.viaChoice).toEqual({
      choiceStepId: 'choice_1',
      optionId: 'opt_b',
    });
  });

  it('falls back to the next connection when the selected option has a null target and next exists', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        connections: [{ targetSceneId: 'fallback', outputPort: 'next' }],
        timeline: [
          choiceStep('choice_1', [{ id: 'opt_a', text: 'Continue', targetSceneId: null }]),
        ],
      }),
      scene('fallback'),
    ];

    const result = expandActivePath(scenes);

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'fallback']);
    const option = result.branchInfoByChoiceStepId.choice_1.options[0];
    expect(option.isEmpty).toBe(false);
    expect(option.isBroken).toBe(false);
  });

  it('ends the path at the choice scene when selected option has a null target and no next', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [{ id: 'opt_a', text: 'Continue', targetSceneId: null }]),
        ],
      }),
    ];

    const result = expandActivePath(scenes);

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a']);
    const option = result.branchInfoByChoiceStepId.choice_1.options[0];
    expect(option.isEmpty).toBe(true);
  });

  it('uses the first option when there is no selection in the map', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_a', text: 'First', targetSceneId: 'b' },
            { id: 'opt_b', text: 'Second', targetSceneId: 'c' },
          ]),
        ],
      }),
      scene('b'),
      scene('c'),
    ];

    const result = expandActivePath(scenes, {});

    expect(result.branchInfoByChoiceStepId.choice_1.selectedOptionId).toBe('opt_a');
    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('falls back to the first option when the selection points to a non-existent optionId', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_a', text: 'First', targetSceneId: 'b' },
            { id: 'opt_b', text: 'Second', targetSceneId: 'c' },
          ]),
        ],
      }),
      scene('b'),
      scene('c'),
    ];

    const result = expandActivePath(scenes, { choice_1: 'does_not_exist' });

    expect(result.branchInfoByChoiceStepId.choice_1.selectedOptionId).toBe('opt_a');
    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('stops at the choice scene with a danglingTarget warning when the selected option target is missing', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_a', text: 'Broken', targetSceneId: 'missing' },
            { id: 'opt_b', text: 'Fine', targetSceneId: 'b' },
          ]),
        ],
      }),
      scene('b'),
    ];

    const result = expandActivePath(scenes, { choice_1: 'opt_a' });

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a']);
    const branchInfo = result.branchInfoByChoiceStepId.choice_1;
    expect(branchInfo.warning).toBe('danglingTarget');
    expect(branchInfo.selectedOptionId).toBe('opt_a');
    const brokenOption = branchInfo.options.find((o) => o.optionId === 'opt_a')!;
    expect(brokenOption.isBroken).toBe(true);
    expect(brokenOption.isEmpty).toBe(true);
  });

  it('terminates on a cycle A -> B -> A', () => {
    const scenes = [
      scene('a', { isStart: true, connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      scene('b', { connections: [{ targetSceneId: 'a', outputPort: 'next' }] }),
    ];

    const result = expandActivePath(scenes);

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('lists unreachable scenes in offPathScenes sorted by createdAt', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_a', text: 'Left', targetSceneId: 'left' },
            { id: 'opt_b', text: 'Right', targetSceneId: 'right' },
          ]),
        ],
      }),
      scene('left', { createdAt: 5 }),
      scene('right', { createdAt: 2 }),
    ];

    const result = expandActivePath(scenes, { choice_1: 'opt_a' });

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'left']);
    expect(result.offPathScenes.map((s) => s.id)).toEqual(['right']);
  });

  it('marks merge points with incomingCount and clears viaChoice after the merge', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_a', text: 'Left', targetSceneId: 'left' },
            { id: 'opt_b', text: 'Right', targetSceneId: 'right' },
          ]),
        ],
      }),
      scene('left', { connections: [{ targetSceneId: 'merge', outputPort: 'next' }] }),
      scene('right', { connections: [{ targetSceneId: 'merge', outputPort: 'next' }] }),
      scene('merge', { connections: [{ targetSceneId: 'after', outputPort: 'next' }] }),
      scene('after'),
    ];

    const result = expandActivePath(scenes, { choice_1: 'opt_a' });

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'left', 'merge', 'after']);
    expect(result.metadataBySceneId.merge.incomingCount).toBe(2);
    expect(result.metadataBySceneId.merge.isMergePoint).toBe(true);
    expect(result.metadataBySceneId.merge.viaChoice).toBeUndefined();
    expect(result.metadataBySceneId.after.viaChoice).toBeUndefined();
  });

  it('produces a different active path tail when the selection changes', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_a', text: 'Left', targetSceneId: 'left' },
            { id: 'opt_b', text: 'Right', targetSceneId: 'right' },
          ]),
        ],
      }),
      scene('left'),
      scene('right'),
    ];

    const resultLeft = expandActivePath(scenes, { choice_1: 'opt_a' });
    const resultRight = expandActivePath(scenes, { choice_1: 'opt_b' });

    expect(resultLeft.activeScenes.map((s) => s.id)).toEqual(['a', 'left']);
    expect(resultRight.activeScenes.map((s) => s.id)).toEqual(['a', 'right']);
  });

  it('ignores a disabled choice step and follows next instead', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        connections: [{ targetSceneId: 'b', outputPort: 'next' }],
        timeline: [
          choiceStep(
            'choice_1',
            [{ id: 'opt_a', text: 'Ignored', targetSceneId: 'c' }],
            { enabled: false },
          ),
        ],
      }),
      scene('b'),
      scene('c'),
    ];

    const result = expandActivePath(scenes);

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'b']);
    expect(result.branchInfoByChoiceStepId.choice_1).toBeUndefined();
  });

  it('ignores a choice step with zero options and follows next instead', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        connections: [{ targetSceneId: 'b', outputPort: 'next' }],
        timeline: [choiceStep('choice_1', [])],
      }),
      scene('b'),
    ];

    const result = expandActivePath(scenes);

    expect(result.activeScenes.map((s) => s.id)).toEqual(['a', 'b']);
    expect(result.branchInfoByChoiceStepId.choice_1).toBeUndefined();
  });
});
