import { act, renderHook, waitFor } from '@testing-library/react';
import type { EffectBlockData, StopEffectBlockData, TimelineStep } from '@/lib/engine/types';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';

function textStep(id: string, content: string): TimelineStep {
  return {
    id,
    blockType: 'text',
    data: { content, typewriterSpeed: 0.5, anchorTo: 'background' },
    collapsed: false,
    enabled: true,
  } as TimelineStep;
}

function effectStep(id: string, data: Partial<EffectBlockData> & { effectType: EffectBlockData['effectType'] }): TimelineStep {
  return {
    id,
    blockType: 'effect',
    data: {
      target: 'screen',
      intensity: 50,
      duration: 10,
      durationMode: 'scene',
      ...data,
    },
    collapsed: false,
    enabled: true,
  } as TimelineStep;
}

function stopEffectStep(id: string, data: Partial<StopEffectBlockData> = {}): TimelineStep {
  return {
    id,
    blockType: 'stop_effect',
    data: { effectType: 'all', target: 'all', ...data },
    collapsed: false,
    enabled: true,
  } as TimelineStep;
}

/** Advance past the current text halt: complete typing, then move on. */
async function advancePast(result: { current: ReturnType<typeof useSceneExecutor> }) {
  if (result.current.isTyping) {
    act(() => {
      result.current.advance();
    });
    await waitFor(() => expect(result.current.isTyping).toBe(false));
  }
  act(() => {
    result.current.advance();
  });
}

describe('useSceneExecutor stop_effect', () => {
  it('removes every active effect when effectType is "all"', async () => {
    const timeline = [
      effectStep('step-1', { effectType: 'rain' }),
      effectStep('step-2', { effectType: 'fog' }),
      textStep('step-3', 'Storm rages'),
      stopEffectStep('step-4'),
      textStep('step-5', 'Calm again'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(2));
    expect(result.current.sceneState.activeEffects.map((effect) => effect.effectType)).toEqual(['rain', 'fog']);

    await advancePast(result);
    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(4);
      expect(result.current.sceneState.activeEffects).toEqual([]);
    });
  });

  it('removes only the matching effect type and keeps the rest', async () => {
    const timeline = [
      effectStep('step-1', { effectType: 'rain' }),
      effectStep('step-2', { effectType: 'fog' }),
      textStep('step-3', 'Both running'),
      stopEffectStep('step-4', { effectType: 'rain' }),
      textStep('step-5', 'Fog only'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(2));
    await advancePast(result);
    await waitFor(() => {
      expect(result.current.sceneState.activeEffects.map((effect) => effect.effectType)).toEqual(['fog']);
    });
  });

  it('filters by target when one is set', async () => {
    const timeline = [
      effectStep('step-1', { effectType: 'shake', target: 'screen' }),
      effectStep('step-2', { effectType: 'shake', target: 'background' }),
      textStep('step-3', 'Double shake'),
      stopEffectStep('step-4', { effectType: 'shake', target: 'background' }),
      textStep('step-5', 'Screen shake only'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(2));
    await advancePast(result);
    await waitFor(() => {
      expect(result.current.sceneState.activeEffects.map((effect) => effect.target)).toEqual(['screen']);
    });
  });

  it('is a no-op when nothing matches and when the step is disabled', async () => {
    const timeline = [
      effectStep('step-1', { effectType: 'snow' }),
      textStep('step-2', 'Snowing'),
      stopEffectStep('step-3', { effectType: 'rain' }),
      { ...stopEffectStep('step-4'), enabled: false },
      textStep('step-5', 'Still snowing'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(1));
    await advancePast(result);
    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(4);
      expect(result.current.sceneState.activeEffects.map((effect) => effect.effectType)).toEqual(['snow']);
    });
  });

  it('restores stopped effects on rollback', async () => {
    const timeline = [
      effectStep('step-1', { effectType: 'rain' }),
      textStep('step-2', 'Rainy'),
      stopEffectStep('step-3'),
      textStep('step-4', 'Dry'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(1));
    await advancePast(result);
    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(3);
      expect(result.current.sceneState.activeEffects).toEqual([]);
    });

    act(() => {
      result.current.rollback();
    });
    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(1);
      expect(result.current.sceneState.activeEffects.map((effect) => effect.effectType)).toEqual(['rain']);
    });
  });
});
