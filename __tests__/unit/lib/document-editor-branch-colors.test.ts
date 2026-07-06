import {
  BRANCH_COLOR_PALETTE,
  branchColorForOptionIndex,
  computeBranchColorBySceneId,
} from '@/lib/document-editor/branch-colors';
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

describe('branchColorForOptionIndex', () => {
  it('is stable per index and wraps around the palette', () => {
    expect(branchColorForOptionIndex(0)).toBe(BRANCH_COLOR_PALETTE[0]);
    expect(branchColorForOptionIndex(1)).toBe(BRANCH_COLOR_PALETTE[1]);
    expect(branchColorForOptionIndex(BRANCH_COLOR_PALETTE.length)).toBe(BRANCH_COLOR_PALETTE[0]);
    expect(branchColorForOptionIndex(BRANCH_COLOR_PALETTE.length + 2)).toBe(BRANCH_COLOR_PALETTE[2]);
  });

  it('falls back to the first color for negative indexes', () => {
    expect(branchColorForOptionIndex(-1)).toBe(BRANCH_COLOR_PALETTE[0]);
  });
});

describe('computeBranchColorBySceneId', () => {
  it('colors scenes by the option index of the choice edge they were reached through', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_1', text: 'One', targetSceneId: 'b' },
            { id: 'opt_2', text: 'Two', targetSceneId: 'c' },
          ]),
        ],
      }),
      scene('b', { connections: [{ targetSceneId: 'd', outputPort: 'next' }] }),
      scene('c'),
      scene('d'),
    ];

    const firstBranch = computeBranchColorBySceneId(expandActivePath(scenes, { choice_1: 'opt_1' }));
    expect(firstBranch['a']).toBeUndefined();
    expect(firstBranch['b']).toBe(BRANCH_COLOR_PALETTE[0]);
    // Scenes past the branch entry inherit the same tint until a merge point.
    expect(firstBranch['d']).toBe(BRANCH_COLOR_PALETTE[0]);

    const secondBranch = computeBranchColorBySceneId(expandActivePath(scenes, { choice_1: 'opt_2' }));
    expect(secondBranch['c']).toBe(BRANCH_COLOR_PALETTE[1]);
  });

  it('leaves merge points and pre-choice scenes neutral', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_1', [
            { id: 'opt_1', text: 'One', targetSceneId: 'b' },
            { id: 'opt_2', text: 'Two', targetSceneId: 'merge' },
          ]),
        ],
        connections: [{ targetSceneId: 'merge', outputPort: 'opt_2' }],
      }),
      scene('b', { connections: [{ targetSceneId: 'merge', outputPort: 'next' }] }),
      scene('merge'),
    ];

    const colors = computeBranchColorBySceneId(expandActivePath(scenes, { choice_1: 'opt_1' }));
    expect(colors['a']).toBeUndefined();
    expect(colors['b']).toBe(BRANCH_COLOR_PALETTE[0]);
    expect(colors['merge']).toBeUndefined();
  });

  it('returns an empty map for a linear story without choices', () => {
    const scenes = [
      scene('a', { isStart: true, connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      scene('b'),
    ];

    expect(computeBranchColorBySceneId(expandActivePath(scenes))).toEqual({});
  });
});
