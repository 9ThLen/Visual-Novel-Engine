import { act, renderHook, waitFor } from '@testing-library/react';
import { createTextStep, createVideoStep } from '@/lib/engine/event-factory';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';

describe('useSceneExecutor background video', () => {
  it('projects a background play step into plain runtime state', async () => {
    const play = createVideoStep({
      assetId: 'video-1',
      posterAssetId: 'poster-1',
      fit: 'contain',
      startAt: 2,
      endAt: 5,
    });
    const timeline = [play, createTextStep({ content: 'Ready' })];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.activeVideo).toEqual({
        stepId: play.id,
        assetId: 'video-1',
        posterAssetId: 'poster-1',
        layer: 'background',
        fit: 'contain',
        playbackRate: 1,
        startAt: 2,
        endAt: 5,
        muted: true,
        volume: 0,
        loop: true,
        skippableAfterMs: null,
      });
      expect(result.current.canAdvance).toBe(true);
    });
  });

  it('restores the static background by clearing activeVideo on stop', async () => {
    const timeline = [
      createVideoStep({ assetId: 'video-1' }),
      createVideoStep({ mode: 'stop', layer: 'background' }),
      createTextStep({ content: 'Stopped' }),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.activeVideo).toBeNull();
      expect(result.current.canAdvance).toBe(true);
    });
  });

});

describe('useSceneExecutor blocking cutscene', () => {
  const cutsceneTimeline = () => {
    const cutscene = createVideoStep({ layer: 'cutscene', assetId: 'cutscene-1', skippableAfterMs: 1500 });
    return { cutscene, timeline: [cutscene, createTextStep({ content: 'After the cutscene' })] };
  };

  it('halts on the cutscene and refuses to be tapped through', async () => {
    const { cutscene, timeline } = cutsceneTimeline();
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.pendingVideo).toEqual({ stepId: cutscene.id, session: 1 });
    });
    expect(result.current.sceneState.activeVideo?.layer).toBe('cutscene');
    // Tap, auto-play and turbo all go through advance(); none of them may
    // dismiss a cutscene.
    expect(result.current.canAdvance).toBe(false);

    act(() => result.current.advance());

    expect(result.current.pendingVideo).toEqual({ stepId: cutscene.id, session: 1 });
    expect(result.current.currentStepIndex).toBe(0);
  });

  it('resumes the timeline exactly once when the clip completes', async () => {
    const { cutscene, timeline } = cutsceneTimeline();
    const { result } = renderHook(() => useSceneExecutor(timeline));
    await waitFor(() => expect(result.current.pendingVideo).not.toBeNull());

    act(() => result.current.completeVideo(cutscene.id, 1));

    await waitFor(() => {
      expect(result.current.pendingVideo).toBeNull();
      expect(result.current.currentStepIndex).toBe(1);
    });

    // A player that fires its completion twice must not advance twice.
    act(() => result.current.completeVideo(cutscene.id, 1));
    expect(result.current.currentStepIndex).toBe(1);
  });

  it('treats Skip as the same resolution as a natural end', async () => {
    const { cutscene, timeline } = cutsceneTimeline();
    const { result } = renderHook(() => useSceneExecutor(timeline));
    await waitFor(() => expect(result.current.pendingVideo).not.toBeNull());

    act(() => result.current.skipVideo(cutscene.id, 1));

    await waitFor(() => expect(result.current.currentStepIndex).toBe(1));
    expect(result.current.pendingVideo).toBeNull();
  });

  it('ignores a completion for another step or a stale session', async () => {
    const { cutscene, timeline } = cutsceneTimeline();
    const { result } = renderHook(() => useSceneExecutor(timeline));
    await waitFor(() => expect(result.current.pendingVideo).not.toBeNull());

    act(() => result.current.completeVideo('some-other-step', 1));
    act(() => result.current.completeVideo(cutscene.id, 99));

    expect(result.current.pendingVideo).toEqual({ stepId: cutscene.id, session: 1 });
    expect(result.current.currentStepIndex).toBe(0);
  });

  it('puts the background clip aside and brings it back afterwards', async () => {
    const background = createVideoStep({ assetId: 'bg-clip' });
    const cutscene = createVideoStep({ layer: 'cutscene', assetId: 'cutscene-1' });
    const timeline = [background, cutscene, createTextStep({ content: 'Back to the loop' })];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.pendingVideo).not.toBeNull());
    // Only one clip decodes at a time, so the background is not active here.
    expect(result.current.sceneState.activeVideo?.assetId).toBe('cutscene-1');

    act(() => result.current.completeVideo(cutscene.id, 1));

    await waitFor(() => {
      expect(result.current.sceneState.activeVideo?.assetId).toBe('bg-clip');
      expect(result.current.sceneState.activeVideo?.layer).toBe('background');
    });
  });

  it('does not let a cutscene halt become a rollback point', async () => {
    const { cutscene, timeline } = cutsceneTimeline();
    const { result } = renderHook(() => useSceneExecutor(timeline));
    await waitFor(() => expect(result.current.pendingVideo).not.toBeNull());

    act(() => result.current.completeVideo(cutscene.id, 1));
    await waitFor(() => expect(result.current.currentStepIndex).toBe(1));

    // Rolling back from the text that follows must not replay the cutscene.
    expect(result.current.canRollback).toBe(false);
  });

  it('starts a fresh session when the same cutscene is re-entered', async () => {
    const cutscene = createVideoStep({ layer: 'cutscene', assetId: 'cutscene-1' });
    const timeline = [
      cutscene,
      createTextStep({ content: 'Second cutscene follows' }),
      createVideoStep({ layer: 'cutscene', assetId: 'cutscene-2' }),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.pendingVideo?.session).toBe(1));
    act(() => result.current.completeVideo(cutscene.id, 1));
    await waitFor(() => expect(result.current.canAdvance).toBe(true));

    // The text between the two cutscenes types first: one advance() finishes
    // the typewriter, the next one leaves the step.
    act(() => result.current.advance());
    act(() => result.current.advance());

    await waitFor(() => expect(result.current.pendingVideo?.session).toBe(2));
    // The first player's completion must not resolve the second cutscene.
    act(() => result.current.completeVideo(result.current.pendingVideo!.stepId, 1));
    expect(result.current.pendingVideo?.session).toBe(2);
  });
});
