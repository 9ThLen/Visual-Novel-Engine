import { act, renderHook, waitFor } from '@testing-library/react';
import type { TimelineStep } from '@/lib/engine/types';
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

function dialogueStep(id: string, text: string): TimelineStep {
  return {
    id,
    blockType: 'dialogue',
    data: {
      entries: [{ characterId: 'char-1', speakerName: 'Hero', text }],
      currentEntryIndex: 0,
    },
    collapsed: false,
    enabled: true,
  } as TimelineStep;
}

/** Advance past the current text/dialogue halt: complete typing, then move on. */
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

describe('useSceneExecutor rollback', () => {
  it('starts with no rollback available and ignores rollback() on an empty stack', async () => {
    const timeline = [textStep('step-1', 'Only line')];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    expect(result.current.canRollback).toBe(false);

    act(() => {
      result.current.rollback();
    });

    expect(result.current.currentStepIndex).toBe(0);
    expect(result.current.canRollback).toBe(false);
  });

  it('restores the previous yield point and allows re-advancing identically', async () => {
    const timeline = [textStep('step-1', 'First line'), textStep('step-2', 'Second line')];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));

    await advancePast(result);
    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(1);
      expect(result.current.canRollback).toBe(true);
    });

    act(() => {
      result.current.rollback();
    });

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.canRollback).toBe(false);
      expect(result.current.canAdvance).toBe(true);
      expect(result.current.isComplete).toBe(false);
    });

    // Re-advancing after rollback lands on the same next yield point.
    act(() => {
      result.current.advance();
    });
    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(1);
      expect(result.current.canRollback).toBe(true);
    });
  });

  it('undoes variable mutations and re-applies them exactly once on re-advance', async () => {
    const timeline = [
      textStep('step-1', 'Before'),
      variableStep('step-2', 'score', 5),
      textStep('step-3', 'After'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline, { initialVariables: { score: 1 } }));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    expect(result.current.sceneState.variables.score).toBe(1);

    await advancePast(result);
    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(2);
      expect(result.current.sceneState.variables.score).toBe(5);
    });

    act(() => {
      result.current.rollback();
    });

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.sceneState.variables.score).toBe(1);
    });

    act(() => {
      result.current.advance();
    });
    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(2);
      expect(result.current.sceneState.variables.score).toBe(5);
    });
  });

  it('walks back through multiple yield points in reverse order', async () => {
    const timeline = [
      textStep('step-1', 'One'),
      textStep('step-2', 'Two'),
      textStep('step-3', 'Three'),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    await advancePast(result);
    await waitFor(() => expect(result.current.currentStepIndex).toBe(1));
    await advancePast(result);
    await waitFor(() => expect(result.current.currentStepIndex).toBe(2));

    act(() => {
      result.current.rollback();
    });
    await waitFor(() => expect(result.current.currentStepIndex).toBe(1));
    expect(result.current.canRollback).toBe(true);

    act(() => {
      result.current.rollback();
    });
    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    expect(result.current.canRollback).toBe(false);
  });

  it('restores the dialogue history captured at the snapshot', async () => {
    const timeline = [dialogueStep('step-1', 'Hello'), dialogueStep('step-2', 'World')];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    expect(result.current.sceneState.dialogueHistory).toHaveLength(1);

    await advancePast(result);
    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(1);
      expect(result.current.sceneState.dialogueHistory).toHaveLength(2);
    });

    act(() => {
      result.current.rollback();
    });

    await waitFor(() => {
      expect(result.current.sceneState.dialogueHistory).toHaveLength(1);
      expect(result.current.sceneState.dialogueHistory[0].text).toBe('Hello');
    });
  });

  it('clears the rollback stack when the timeline changes', async () => {
    const timelineA = [textStep('a-1', 'A one'), textStep('a-2', 'A two')];
    const timelineB = [textStep('b-1', 'B one')];
    const { result, rerender } = renderHook(
      ({ timeline }: { timeline: TimelineStep[] }) => useSceneExecutor(timeline),
      { initialProps: { timeline: timelineA } },
    );

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    await advancePast(result);
    await waitFor(() => expect(result.current.canRollback).toBe(true));

    rerender({ timeline: timelineB });

    await waitFor(() => {
      expect(result.current.canRollback).toBe(false);
      expect(result.current.currentStepIndex).toBe(0);
    });
  });
});
