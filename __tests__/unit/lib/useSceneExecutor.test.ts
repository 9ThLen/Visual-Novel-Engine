import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { TimelineStep } from '@/lib/engine/types';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';

function makeTextStep(id: string, content: string): TimelineStep {
  return {
    id,
    blockType: 'text',
    data: {
      content,
      typewriterSpeed: 0.5,
      anchorTo: 'background',
    },
    collapsed: false,
    enabled: true,
  };
}

function makeTransitionStep(id: string, targetSceneId: string): TimelineStep {
  return {
    id,
    blockType: 'transition',
    data: {
      targetSceneId,
      transitionType: 'fade',
      duration: 0.4,
    },
    collapsed: false,
    enabled: true,
  };
}

describe('useSceneExecutor', () => {
  it('stays advanceable after text typing is completed so the next tap can continue', async () => {
    const timeline = [
      makeTextStep('step-1', 'First line'),
      makeTransitionStep('step-2', 'scene-2'),
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.isTyping).toBe(true);
      expect(result.current.canAdvance).toBe(true);
    });

    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.isTyping).toBe(false);
      expect(result.current.canAdvance).toBe(true);
      expect(result.current.currentStepIndex).toBe(0);
    });

    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.sceneState.isTransitioning).toBe(true);
      expect(result.current.sceneState.transitionTarget).toBe('scene-2');
    });
  });
});
