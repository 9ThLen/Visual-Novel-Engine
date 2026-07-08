import type { TimelineStep } from '@/lib/engine/types';
import type { SceneState } from '@/lib/engine/runtime-types';
import { buildPreviewDebugModel } from '@/lib/editor/preview-debug';

function makeSceneState(overrides: Partial<SceneState> = {}): SceneState {
  return {
    backgroundAssetId: null,
    backgroundTransition: 'none',
    characters: [],
    activeEffects: [],
    musicTrackId: null,
    musicPlaying: false,
    musicVolume: 0.8,
    variables: {},
    dialogueHistory: [],
    currentChoices: null,
    isTransitioning: false,
    transitionTarget: null,
    ...overrides,
  };
}

function makeTimeline(): TimelineStep[] {
  return [
    { id: 'a', blockType: 'text', data: {} as never, collapsed: false, enabled: true },
    { id: 'b', blockType: 'variable', data: {} as never, collapsed: false, enabled: false },
    { id: 'c', blockType: 'choice', data: {} as never, collapsed: false, enabled: true },
  ];
}

describe('buildPreviewDebugModel', () => {
  it('produces an empty model without throwing for a fresh scene state', () => {
    const model = buildPreviewDebugModel(makeSceneState(), [], 0, 0, false, false);
    expect(model.variables).toEqual([]);
    expect(model.choices).toEqual([]);
    expect(model.effects).toEqual([]);
    expect(model.transition).toBeNull();
    expect(model.music.trackLabel).toBe('none');
    expect(model.position.totalSteps).toBe(0);
  });

  it('sorts variables alphabetically and formats each type distinctly', () => {
    const sceneState = makeSceneState({
      variables: { zebra: 'text', apple: 3, banana: true },
    });
    const model = buildPreviewDebugModel(sceneState, [], 0, 0, false, false);
    expect(model.variables).toEqual([
      { name: 'apple', kind: 'number', display: '3' },
      { name: 'banana', kind: 'boolean', display: 'true' },
      { name: 'zebra', kind: 'string', display: '"text"' },
    ]);
  });

  it('counts only enabled steps for position tracking', () => {
    const timeline = makeTimeline();
    const model = buildPreviewDebugModel(makeSceneState(), timeline, 2, 0, false, false);
    expect(model.position.totalSteps).toBe(2);
    expect(model.position.stepNumber).toBe(2);
    expect(model.position.blockType).toBe('choice');
  });

  it('includes condition text on choice rows and maps a null target to the next label', () => {
    const sceneState = makeSceneState({
      currentChoices: [
        { id: 'opt-1', text: 'Go north', targetSceneId: 'scene-2' },
        {
          id: 'opt-2',
          text: 'Go south',
          targetSceneId: null,
          condition: { variableName: 'hasKey', operator: '==', value: true },
        },
      ],
    });
    const model = buildPreviewDebugModel(sceneState, [], 0, 0, false, false);
    expect(model.choices).toEqual([
      { id: 'opt-1', text: 'Go north', targetLabel: 'scene-2', conditionText: null },
      { id: 'opt-2', text: 'Go south', targetLabel: 'next', conditionText: 'hasKey == true' },
    ]);
  });

  it('computes remaining effect time from an injected now instead of the real clock', () => {
    const sceneState = makeSceneState({
      activeEffects: [
        { effectType: 'shake', target: 'screen', intensity: 50, startTime: 0, endTime: 5000 },
      ],
    });
    const model = buildPreviewDebugModel(sceneState, [], 0, 2000, false, false);
    expect(model.effects).toEqual([
      { effectType: 'shake', intensity: 50, remainingSeconds: 3 },
    ]);
  });

  it('reports no remaining time for scene-bound effects instead of a huge number', () => {
    const sceneState = makeSceneState({
      activeEffects: [
        {
          effectType: 'rain',
          target: 'screen',
          intensity: 80,
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          sceneBound: true,
        },
      ],
    });
    const model = buildPreviewDebugModel(sceneState, [], 0, 2000, false, false);
    expect(model.effects).toEqual([
      { effectType: 'rain', intensity: 80, remainingSeconds: null },
    ]);
  });

  it('reports a music track label of none when in silence mode', () => {
    const sceneState = makeSceneState({ musicTrackId: 'track-1', musicMode: 'silence' });
    const model = buildPreviewDebugModel(sceneState, [], 0, 0, false, false);
    expect(model.music.trackLabel).toBe('none');
  });

  it('surfaces a transition summary only when a transition is pending', () => {
    const sceneState = makeSceneState({ transitionTarget: 'scene-3', transitionMode: 'scene' });
    const model = buildPreviewDebugModel(sceneState, [], 0, 0, false, false);
    expect(model.transition).toEqual({ target: 'scene-3', mode: 'scene', type: null });
  });
});
