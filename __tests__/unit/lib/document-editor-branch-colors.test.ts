import {
  BRANCH_COLOR_PALETTE,
  branchColorForOptionIndex,
  computeBranchColorBySceneId,
  mixBranchColors,
  mixHexColors,
  pastelBranchColor,
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

describe('mixHexColors / pastelBranchColor', () => {
  it('mixes two colors by weight and clamps out-of-range weights', () => {
    expect(mixHexColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHexColors('#000000', '#ffffff', -1)).toBe('#000000');
    expect(mixHexColors('#000000', '#ffffff', 2)).toBe('#ffffff');
  });

  it('pastelizes toward white', () => {
    expect(pastelBranchColor('#000000')).toBe(mixHexColors('#000000', '#ffffff', 0.45));
  });
});

describe('mixBranchColors', () => {
  it('interpolates the hue along the shortest arc, keeping the mix vivid', () => {
    // Red + green in RGB averages to a dark olive; hue-aware mixing lands on
    // full-strength yellow instead.
    expect(mixBranchColors('#ff0000', '#00ff00', 0.5)).toBe('#ffff00');
  });

  it('returns the endpoints at the extreme weights', () => {
    expect(mixBranchColors('#d97706', '#2563eb', 0)).toBe('#d97706');
    expect(mixBranchColors('#d97706', '#2563eb', 1)).toBe('#2563eb');
  });

  it('produces a saturated intermediate for distant hues like amber and blue', () => {
    const mixed = mixBranchColors('#d97706', '#2563eb', 0.75);
    const r = parseInt(mixed.slice(1, 3), 16);
    const g = parseInt(mixed.slice(3, 5), 16);
    const b = parseInt(mixed.slice(5, 7), 16);
    // Not a gray: the channel spread stays wide instead of collapsing.
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(80);
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
    expect(firstBranch['b']).toBe(pastelBranchColor(BRANCH_COLOR_PALETTE[0]));
    // Scenes past the branch entry inherit the same tint until a merge point.
    expect(firstBranch['d']).toBe(pastelBranchColor(BRANCH_COLOR_PALETTE[0]));

    const secondBranch = computeBranchColorBySceneId(expandActivePath(scenes, { choice_1: 'opt_2' }));
    expect(secondBranch['c']).toBe(pastelBranchColor(BRANCH_COLOR_PALETTE[1]));
  });

  it('blends nested branch colors, nearest branch dominating', () => {
    const scenes = [
      scene('a', {
        isStart: true,
        timeline: [
          choiceStep('choice_outer', [
            { id: 'opt_1', text: 'One', targetSceneId: 'b' },
            { id: 'opt_2', text: 'Two', targetSceneId: 'end' },
          ]),
        ],
      }),
      scene('b', {
        timeline: [
          choiceStep('choice_inner', [
            { id: 'opt_a', text: 'A', targetSceneId: 'deep' },
            { id: 'opt_b', text: 'B', targetSceneId: 'other' },
          ]),
        ],
      }),
      scene('deep'),
      scene('other'),
      scene('end'),
    ];

    const colors = computeBranchColorBySceneId(
      expandActivePath(scenes, { choice_outer: 'opt_1', choice_inner: 'opt_b' }),
    );
    // b sits only inside the outer branch; deep/other add the inner branch on top.
    expect(colors['b']).toBe(pastelBranchColor(BRANCH_COLOR_PALETTE[0]));
    expect(colors['other']).toBe(
      pastelBranchColor(mixBranchColors(BRANCH_COLOR_PALETTE[0], BRANCH_COLOR_PALETTE[1], 0.75)),
    );
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
    expect(colors['b']).toBe(pastelBranchColor(BRANCH_COLOR_PALETTE[0]));
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
