import { act, renderHook, waitFor } from '@testing-library/react';
import type { Condition, GotoBlockData, TimelineStep } from '@/lib/engine/types';
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

function variableStep(id: string, variableName: string, value: number): TimelineStep {
  return {
    id,
    blockType: 'variable',
    data: { variableName, operation: 'set', value },
    collapsed: false,
    enabled: true,
  } as TimelineStep;
}

function labelStep(id: string, name: string): TimelineStep {
  return {
    id,
    blockType: 'label',
    data: { name },
    collapsed: false,
    enabled: true,
  } as TimelineStep;
}

function gotoStep(id: string, data: Partial<GotoBlockData> & { targetLabel: string }): TimelineStep {
  return {
    id,
    blockType: 'goto',
    data: { condition: null, elseTargetLabel: null, ...data },
    collapsed: false,
    enabled: true,
  } as TimelineStep;
}

function condition(variableName: string, operator: Condition['operator'], value: Condition['value']): Condition {
  return { variableName, operator, value };
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

describe('useSceneExecutor labels and goto', () => {
  it('jumps forward over skipped steps on an unconditional goto', async () => {
    const timeline = [
      textStep('step-1', 'Intro'),
      gotoStep('step-2', { targetLabel: 'ending' }),
      textStep('step-3', 'Skipped line'),
      variableStep('step-4', 'skipped', 1),
      labelStep('step-5', 'ending'),
      textStep('step-6', 'Ending line'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));

    await advancePast(result);
    await waitFor(() => {
      // Landed on the ending text, not the skipped one.
      expect(result.current.currentStepIndex).toBe(5);
      expect(result.current.sceneState.variables.skipped).toBeUndefined();
    });
  });

  it('takes the target when the condition passes and falls through when it fails', async () => {
    const buildTimeline = (score: number): TimelineStep[] => [
      variableStep('step-1', 'score', score),
      textStep('step-2', 'Before branch'),
      gotoStep('step-3', { targetLabel: 'win', condition: condition('score', '>=', 3) }),
      textStep('step-4', 'Losing line'),
      labelStep('step-5', 'win'),
      textStep('step-6', 'Winning line'),
    ];

    const winning = renderHook(() => useSceneExecutor(buildTimeline(5)));
    await waitFor(() => expect(winning.result.current.currentStepIndex).toBe(1));
    await advancePast(winning.result);
    await waitFor(() => expect(winning.result.current.currentStepIndex).toBe(5));

    const losing = renderHook(() => useSceneExecutor(buildTimeline(1)));
    await waitFor(() => expect(losing.result.current.currentStepIndex).toBe(1));
    await advancePast(losing.result);
    await waitFor(() => expect(losing.result.current.currentStepIndex).toBe(3));
  });

  it('jumps to the else target when the condition fails', async () => {
    const timeline = [
      textStep('step-1', 'Before branch'),
      gotoStep('step-2', {
        targetLabel: 'win',
        condition: condition('score', '>=', 3),
        elseTargetLabel: 'lose',
      }),
      textStep('step-3', 'Unreachable line'),
      labelStep('step-4', 'lose'),
      textStep('step-5', 'Losing line'),
      labelStep('step-6', 'win'),
      textStep('step-7', 'Winning line'),
    ];
    const { result } = renderHook(() =>
      useSceneExecutor(timeline, { initialVariables: { score: 0 } }),
    );

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    await advancePast(result);
    await waitFor(() => expect(result.current.currentStepIndex).toBe(4));
  });

  it('falls through when the target label does not exist', async () => {
    const timeline = [
      textStep('step-1', 'Before'),
      gotoStep('step-2', { targetLabel: 'missing' }),
      textStep('step-3', 'After'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    await advancePast(result);
    await waitFor(() => expect(result.current.currentStepIndex).toBe(2));
  });

  it('resolves label names consistently after trimming boundary whitespace', async () => {
    const timeline = [
      textStep('step-1', 'Before'),
      gotoStep('step-2', { targetLabel: ' checkpoint ' }),
      textStep('step-3', 'Skipped'),
      labelStep('step-4', 'checkpoint'),
      textStep('step-5', 'After'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    await advancePast(result);
    await waitFor(() => expect(result.current.currentStepIndex).toBe(4));
  });

  it('supports a backward goto loop that yields on each pass', async () => {
    const timeline = [
      labelStep('step-1', 'loop'),
      variableStep('step-2', 'laps', 1),
      textStep('step-3', 'Lap line'),
      gotoStep('step-4', { targetLabel: 'exit', condition: condition('done', '==', true) }),
      gotoStep('step-5', { targetLabel: 'loop' }),
      labelStep('step-6', 'exit'),
      textStep('step-7', 'Exit line'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(2));
    await advancePast(result);
    // Looped back to the same text halt instead of running past the scene.
    await waitFor(() => expect(result.current.currentStepIndex).toBe(2));
    expect(result.current.isComplete).toBe(false);
  });

  it('ends the scene instead of hanging on a yield-less goto loop', async () => {
    const timeline = [
      labelStep('step-1', 'spin'),
      variableStep('step-2', 'ticks', 1),
      gotoStep('step-3', { targetLabel: 'spin' }),
      textStep('step-4', 'Unreachable'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.isComplete).toBe(true));
  });

  it('ignores a disabled goto block', async () => {
    const timeline = [
      textStep('step-1', 'Before'),
      { ...gotoStep('step-2', { targetLabel: 'ending' }), enabled: false },
      textStep('step-3', 'Straight line'),
      labelStep('step-4', 'ending'),
      textStep('step-5', 'Ending line'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    await advancePast(result);
    await waitFor(() => expect(result.current.currentStepIndex).toBe(2));
  });

  it('rolls back across a goto jump and re-branches identically', async () => {
    const timeline = [
      textStep('step-1', 'Before branch'),
      gotoStep('step-2', { targetLabel: 'ending' }),
      textStep('step-3', 'Skipped line'),
      labelStep('step-4', 'ending'),
      textStep('step-5', 'Ending line'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    await advancePast(result);
    await waitFor(() => expect(result.current.currentStepIndex).toBe(4));

    act(() => {
      result.current.rollback();
    });
    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));

    act(() => {
      result.current.advance();
    });
    await waitFor(() => expect(result.current.currentStepIndex).toBe(4));
  });
});
