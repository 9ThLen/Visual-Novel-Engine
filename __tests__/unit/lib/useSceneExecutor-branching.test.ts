import { act, renderHook, waitFor } from '@testing-library/react';
import type { SceneConnection, TimelineStep } from '@/lib/engine/types';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';
import { getNextSceneId } from '@/lib/reader-runtime';
import type { ReaderScene } from '@/lib/reader-scene';

/**
 * End-to-end branch resolution: useSceneExecutor decides the transition mode
 * and target when a choice is selected; getNextSceneId (the same resolver
 * app/reader.tsx uses) turns that into an actual destination scene id. Mirrors
 * the reader's real flow without needing to render app/reader.tsx.
 */

function makeChoiceStep(id: string, options: { id: string; text: string; targetSceneId: string | null }[]): TimelineStep {
  return {
    id,
    blockType: 'choice',
    data: { options },
    collapsed: false,
    enabled: true,
  } as TimelineStep;
}

function makeReaderScene(id: string, connections: SceneConnection[] = []): ReaderScene {
  return {
    id,
    storyId: 'story-1',
    name: id,
    timeline: [],
    connections,
    isStart: id === 'scene-start',
  };
}

describe('useSceneExecutor branching (end-to-end)', () => {
  it('transitions to the explicit targetSceneId when a choice option has one', async () => {
    const timeline: TimelineStep[] = [
      makeChoiceStep('choice-1', [
        { id: 'opt-explicit', text: 'Go to B', targetSceneId: 'scene-b' },
        { id: 'opt-null', text: 'Fallback', targetSceneId: null },
      ]),
    ];

    const sceneRecords: Record<string, ReaderScene> = {
      'scene-start': makeReaderScene('scene-start'),
      'scene-b': makeReaderScene('scene-b'),
    };

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.currentChoices?.length).toBe(2);
    });

    act(() => {
      result.current.selectChoice('opt-explicit');
    });

    await waitFor(() => {
      expect(result.current.sceneState.isTransitioning).toBe(true);
      expect(result.current.sceneState.transitionMode).toBe('scene');
      expect(result.current.sceneState.transitionTarget).toBe('scene-b');
    });

    const resolved = getNextSceneId(
      sceneRecords,
      'scene-start',
      result.current.sceneState.transitionTarget,
      result.current.sceneState.transitionMode,
    );
    expect(resolved).toBe('scene-b');
  });

  it('falls back to the scene\'s next connection when the option has targetSceneId: null', async () => {
    const timeline: TimelineStep[] = [
      makeChoiceStep('choice-1', [
        { id: 'opt-explicit', text: 'Go to B', targetSceneId: 'scene-b' },
        { id: 'opt-null', text: 'Fallback', targetSceneId: null },
      ]),
    ];

    const sceneRecords: Record<string, ReaderScene> = {
      'scene-start': makeReaderScene('scene-start', [
        { targetSceneId: 'scene-next', outputPort: 'next' },
      ]),
      'scene-next': makeReaderScene('scene-next'),
    };

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.currentChoices?.length).toBe(2);
    });

    act(() => {
      result.current.selectChoice('opt-null');
    });

    await waitFor(() => {
      expect(result.current.sceneState.isTransitioning).toBe(true);
      expect(result.current.sceneState.transitionMode).toBe('next');
      // The executor itself only records that there's no explicit target;
      // resolving to an actual scene id is the reader's job (getNextSceneId).
      expect(result.current.sceneState.transitionTarget).toBeFalsy();
    });

    const resolved = getNextSceneId(
      sceneRecords,
      'scene-start',
      result.current.sceneState.transitionTarget,
      result.current.sceneState.transitionMode,
    );
    expect(resolved).toBe('scene-next');
  });

  it('ends the story when a null-target option is chosen and the scene has no next connection', async () => {
    const timeline: TimelineStep[] = [
      makeChoiceStep('choice-1', [
        { id: 'opt-null', text: 'Only option', targetSceneId: null },
      ]),
    ];

    // No `next` connection on scene-start at all.
    const sceneRecords: Record<string, ReaderScene> = {
      'scene-start': makeReaderScene('scene-start'),
    };

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.currentChoices?.length).toBe(1);
    });

    act(() => {
      result.current.selectChoice('opt-null');
    });

    await waitFor(() => {
      expect(result.current.sceneState.isTransitioning).toBe(true);
      expect(result.current.sceneState.transitionMode).toBe('next');
    });

    // Executor doesn't crash and doesn't invent a target; resolution (which
    // the reader treats as "end story") correctly yields null.
    const resolved = getNextSceneId(
      sceneRecords,
      'scene-start',
      result.current.sceneState.transitionTarget,
      result.current.sceneState.transitionMode,
    );
    expect(resolved).toBeNull();
  });
});
