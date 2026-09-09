import { act, renderHook, waitFor } from '@testing-library/react';
import { createCameraStep, createTextStep } from '@/lib/engine/event-factory';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';

/**
 * A text step swallows the first tap to finish typing, so walking to the next
 * technical step takes two.
 */
function step(result: { current: { advance: () => void } }) {
  act(() => result.current.advance());
  act(() => result.current.advance());
}

describe('useSceneExecutor camera state', () => {
  it('holds the framed character across the steps that follow a focus', async () => {
    const timeline = [
      createCameraStep({ action: 'pan', panX: 40, panY: 0, duration: 1 }),
      createTextStep({ content: 'Pan done' }),
      createCameraStep({ action: 'focus', target: 'char_1', zoomLevel: 1.4, duration: 1 }),
      createTextStep({ content: 'Focused' }),
      createCameraStep({ action: 'zoom', zoomLevel: 2, duration: 1 }),
      createTextStep({ content: 'Zoomed' }),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.sceneState.cameraState?.panX).toBe(40));

    step(result);
    await waitFor(() => expect(result.current.sceneState.cameraState?.action).toBe('focus'));
    expect(result.current.sceneState.cameraState?.target).toBe('char_1');

    step(result);
    await waitFor(() => expect(result.current.sceneState.cameraState?.action).toBe('zoom'));
    // Without carrying the target, this step would drop back to the pan that
    // was current before the focus and leave the character off centre.
    expect(result.current.sceneState.cameraState?.target).toBe('char_1');
    expect(result.current.sceneState.cameraState?.zoomLevel).toBe(2);
  });

  it('gives the character up when the author aims somewhere else', async () => {
    const timeline = [
      createCameraStep({ action: 'focus', target: 'char_1', zoomLevel: 1.4, duration: 1 }),
      createTextStep({ content: 'Focused' }),
      createCameraStep({ action: 'pan', panX: 20, panY: 0, duration: 1 }),
      createTextStep({ content: 'Panned away' }),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.sceneState.cameraState?.target).toBe('char_1'));

    step(result);
    await waitFor(() => expect(result.current.sceneState.cameraState?.action).toBe('pan'));
    expect(result.current.sceneState.cameraState?.target).toBeUndefined();
    expect(result.current.sceneState.cameraState?.panX).toBe(20);
  });

  it('drops the character on a reset', async () => {
    const timeline = [
      createCameraStep({ action: 'focus', target: 'char_1', zoomLevel: 1.4, duration: 1 }),
      createTextStep({ content: 'Focused' }),
      createCameraStep({ action: 'reset', duration: 1 }),
      createTextStep({ content: 'Reset' }),
    ];
    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => expect(result.current.sceneState.cameraState?.target).toBe('char_1'));

    step(result);
    await waitFor(() => expect(result.current.sceneState.cameraState?.action).toBe('reset'));
    expect(result.current.sceneState.cameraState?.target).toBeUndefined();
    expect(result.current.sceneState.cameraState?.zoomLevel).toBe(1);
    expect(result.current.sceneState.cameraState?.panX).toBe(0);
  });
});
