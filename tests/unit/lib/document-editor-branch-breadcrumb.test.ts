import {
  buildBranchBreadcrumbTrail,
  crumbsForSceneIndex,
} from '@/lib/document-editor/branch-breadcrumb';
import { branchColorForOptionIndex } from '@/lib/document-editor/branch-colors';
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

/**
 * s1 —choice c1→ [до міста → s2 | в ліс → s3]
 * s2 —choice c2→ [в таверну → s4 | на ринок → s5]
 * s4 —next→ s6; s3 —next→ s6 (s6 = merge point)
 */
function storyScenes(): SceneRecord[] {
  return [
    scene('s1', {
      isStart: true,
      timeline: [choiceStep('c1', [
        { id: 'o_city', text: 'Піти до міста', targetSceneId: 's2' },
        { id: 'o_forest', text: 'Піти в ліс', targetSceneId: 's3' },
      ] as ChoiceOption[])],
    }),
    scene('s2', {
      timeline: [choiceStep('c2', [
        { id: 'o_tavern', text: 'Зайти в таверну', targetSceneId: 's4' },
        { id: 'o_market', text: 'На ринок', targetSceneId: 's5' },
      ] as ChoiceOption[])],
    }),
    scene('s3', { connections: [{ outputPort: 'next', targetSceneId: 's6' }] as SceneRecord['connections'] }),
    scene('s4', { connections: [{ outputPort: 'next', targetSceneId: 's6' }] as SceneRecord['connections'] }),
    scene('s5'),
    scene('s6'),
  ];
}

describe('buildBranchBreadcrumbTrail', () => {
  it('collects one crumb per choice passed on the active path, in path order', () => {
    const activePath = expandActivePath(storyScenes(), { c1: 'o_city', c2: 'o_tavern' });
    const trail = buildBranchBreadcrumbTrail(activePath);

    expect(trail).toHaveLength(2);
    expect(trail[0]).toMatchObject({
      choiceStepId: 'c1',
      sceneId: 's1',
      sceneIndex: 0,
      optionId: 'o_city',
      optionIndex: 0,
      label: 'Піти до міста',
    });
    expect(trail[1]).toMatchObject({
      choiceStepId: 'c2',
      sceneId: 's2',
      sceneIndex: 1,
      optionId: 'o_tavern',
      optionIndex: 0,
      label: 'Зайти в таверну',
    });
  });

  it('keeps the full choice history for merge-point scenes (unlike viaChoiceTrail)', () => {
    const scenes = storyScenes();
    const activePath = expandActivePath(scenes, { c1: 'o_city', c2: 'o_tavern' });
    const trail = buildBranchBreadcrumbTrail(activePath);

    // s6 is a merge point: tinting metadata is cleared there…
    const s6Index = activePath.activeScenes.findIndex((s) => s.id === 's6');
    expect(activePath.metadataBySceneId.s6.isMergePoint).toBe(true);
    expect(activePath.metadataBySceneId.s6.viaChoiceTrail).toBeUndefined();

    // …but the breadcrumb still shows both choices that led here.
    const crumbs = crumbsForSceneIndex(trail, s6Index);
    expect(crumbs.map((c) => c.optionId)).toEqual(['o_city', 'o_tavern']);
  });

  it('falls back to the first option when there is no selection', () => {
    const activePath = expandActivePath(storyScenes());
    const trail = buildBranchBreadcrumbTrail(activePath);

    expect(trail.map((c) => c.optionId)).toEqual(['o_city', 'o_tavern']);
    expect(trail.every((c) => c.optionIndex === 0)).toBe(true);
  });

  it('uses the same color as branchColorForOptionIndex for the selected option', () => {
    const activePath = expandActivePath(storyScenes(), { c1: 'o_forest' });
    const trail = buildBranchBreadcrumbTrail(activePath);

    expect(trail).toHaveLength(1);
    expect(trail[0].optionIndex).toBe(1);
    expect(trail[0].color).toBe(branchColorForOptionIndex(1));
  });

  it('keeps the raw (possibly empty) option text so the UI can decide the fallback', () => {
    const scenes = [
      scene('s1', {
        isStart: true,
        timeline: [choiceStep('c1', [
          { id: 'o_blank', text: '', targetSceneId: 's2' },
        ] as ChoiceOption[])],
      }),
      scene('s2'),
    ];
    const trail = buildBranchBreadcrumbTrail(expandActivePath(scenes));
    expect(trail).toHaveLength(1);
    expect(trail[0].label).toBe('');
  });

  it('still records the crumb when the selected option has a dangling target, but no scene after it shows it', () => {
    const scenes = [
      scene('s1', {
        isStart: true,
        timeline: [choiceStep('c1', [
          { id: 'o_gone', text: 'Зникла гілка', targetSceneId: 's_missing' },
        ] as ChoiceOption[])],
      }),
    ];
    const activePath = expandActivePath(scenes);
    expect(activePath.branchInfoByChoiceStepId.c1.warning).toBe('danglingTarget');

    const trail = buildBranchBreadcrumbTrail(activePath);
    expect(trail).toHaveLength(1);
    // The path stops at s1, and s1's own choice is not part of its breadcrumb.
    expect(crumbsForSceneIndex(trail, 0)).toEqual([]);
  });
});

describe('crumbsForSceneIndex', () => {
  it('excludes the scene’s own choice and everything after it', () => {
    const activePath = expandActivePath(storyScenes(), { c1: 'o_city', c2: 'o_tavern' });
    const trail = buildBranchBreadcrumbTrail(activePath);

    expect(crumbsForSceneIndex(trail, 0)).toEqual([]); // s1: start scene, no history
    expect(crumbsForSceneIndex(trail, 1).map((c) => c.choiceStepId)).toEqual(['c1']); // s2
    expect(crumbsForSceneIndex(trail, 2).map((c) => c.choiceStepId)).toEqual(['c1', 'c2']); // s4
    expect(crumbsForSceneIndex(trail, -1)).toEqual([]);
  });
});
