import { act, renderHook, waitFor } from '@testing-library/react';
import type { TimelineStep } from '@/lib/engine/types';
import type { RuntimeVariables } from '@/lib/engine/runtime-types';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';

/**
 * Loading a save slot whose sceneId is the scene already on screen leaves the
 * timeline byte-identical, so the executor's timeline hash never changes. The
 * host bumps `resetKey` instead; without it the load is a silent no-op.
 */

function textStep(id: string, content: string): TimelineStep {
  return {
    id,
    blockType: 'text',
    data: { content, typewriterSpeed: 0.5, anchorTo: 'background' },
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

describe('useSceneExecutor resetKey', () => {
  const timeline = [
    textStep('step-1', 'Intro'),
    textStep('step-2', 'Middle'),
    textStep('step-3', 'End'),
  ];

  function renderExecutor(initialVariables: RuntimeVariables, resetKey: number) {
    return renderHook(
      ({ variables, key }: { variables: RuntimeVariables; key: number }) =>
        useSceneExecutor(timeline, { initialVariables: variables, resetKey: key }),
      { initialProps: { variables: initialVariables, key: resetKey } },
    );
  }

  it('restarts the same scene from step 0 with the loaded slot variables', async () => {
    const { result, rerender } = renderExecutor({ trust: 1 }, 0);

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    await advancePast(result);
    await advancePast(result);
    await waitFor(() => expect(result.current.currentStepIndex).toBe(2));
    expect(result.current.canRollback).toBe(true);

    // Same scene, same timeline — only the slot's variables and the generation
    // the host bumped on load are different.
    rerender({ variables: { trust: 5, metRival: true }, key: 1 });

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.isTyping).toBe(true);
    });
    expect(result.current.sceneState.variables).toEqual({ trust: 5, metRival: true });
    expect(result.current.sceneState.dialogueHistory).toEqual([]);
    expect(result.current.isComplete).toBe(false);
    // The pre-load yield points are gone with the playback they belonged to.
    expect(result.current.canRollback).toBe(false);
  });

  it('does not restart when only the variables change and the key is unchanged', async () => {
    const { result, rerender } = renderExecutor({ trust: 1 }, 0);

    await waitFor(() => expect(result.current.currentStepIndex).toBe(0));
    await advancePast(result);
    await waitFor(() => expect(result.current.currentStepIndex).toBe(1));

    rerender({ variables: { trust: 5 }, key: 0 });

    // Seeded variables are read only at reset, so mid-scene prop churn (the
    // reader re-rendering as playback advances) must not rewind the reader.
    expect(result.current.currentStepIndex).toBe(1);
    expect(result.current.sceneState.variables).toEqual({ trust: 1 });
  });
});
