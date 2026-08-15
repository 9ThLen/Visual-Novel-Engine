import { renderHook, waitFor } from '@testing-library/react';
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

  it('does not treat a cutscene as a non-blocking background video', async () => {
    const timeline = [
      createVideoStep({ layer: 'cutscene', assetId: 'cutscene-1' }),
      createTextStep({ content: 'Not implemented yet' }),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.activeVideo).toBeUndefined();
      expect(result.current.canAdvance).toBe(true);
    });
  });
});
