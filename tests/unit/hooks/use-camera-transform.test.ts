import { act, renderHook } from '@testing-library/react';
import { useCameraTransform } from '@/components/reader/useCameraTransform';
import type { CameraRuntimeState } from '@/lib/engine/runtime-types';

const WIDTH = 1000;

function camera(overrides: Partial<CameraRuntimeState>): CameraRuntimeState {
  return {
    action: 'zoom',
    zoomLevel: 1,
    panX: 0,
    panY: 0,
    duration: 1,
    easing: 'linear',
    ...overrides,
  };
}

/**
 * The tween runs on requestAnimationFrame against Date.now, so the fake clock
 * has to move both: advancing timers alone would replay the same frame.
 */
function advance(ms: number, stepMs = 16) {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    act(() => {
      vi.advanceTimersByTime(stepMs);
    });
  }
}

describe('useCameraTransform', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the first camera state instead of animating into it', () => {
    const { result } = renderHook(() => useCameraTransform(camera({ zoomLevel: 2 }), [], WIDTH));
    // A scene that opens zoomed in must not zoom out of nothing on load.
    expect(result.current.scale).toBe(2);
  });

  it('takes the authored duration to reach the new frame', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: CameraRuntimeState }) => useCameraTransform(state, [], WIDTH),
      { initialProps: { state: camera({ zoomLevel: 1 }) } },
    );

    rerender({ state: camera({ zoomLevel: 2, duration: 2 }) });
    expect(result.current.scale).toBe(1);

    advance(1000);
    const halfway = result.current.scale;
    // Linear easing, half the time: visibly moving, nowhere near arrived.
    expect(halfway).toBeGreaterThan(1.2);
    expect(halfway).toBeLessThan(1.8);

    advance(1200);
    expect(result.current.scale).toBe(2);
  });

  it('snaps when the step asks for no duration', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: CameraRuntimeState }) => useCameraTransform(state, [], WIDTH),
      { initialProps: { state: camera({ zoomLevel: 1 }) } },
    );

    rerender({ state: camera({ zoomLevel: 1.5, duration: 0 }) });
    expect(result.current.scale).toBe(1.5);
  });

  it('continues from where the picture is when a move interrupts another', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: CameraRuntimeState }) => useCameraTransform(state, [], WIDTH),
      { initialProps: { state: camera({ zoomLevel: 1 }) } },
    );

    rerender({ state: camera({ zoomLevel: 3, duration: 4 }) });
    advance(1000);
    const interrupted = result.current.scale;
    expect(interrupted).toBeGreaterThan(1);
    expect(interrupted).toBeLessThan(3);

    // The second step must not jump back to 1 before starting.
    rerender({ state: camera({ zoomLevel: 1, duration: 2 }) });
    expect(result.current.scale).toBe(interrupted);

    advance(2200);
    expect(result.current.scale).toBe(1);
  });

  it('does not restart the move when the runtime state object is rebuilt unchanged', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: CameraRuntimeState }) => useCameraTransform(state, [], WIDTH),
      { initialProps: { state: camera({ zoomLevel: 1 }) } },
    );

    rerender({ state: camera({ zoomLevel: 2, duration: 2 }) });
    advance(2200);
    expect(result.current.scale).toBe(2);

    // The executor hands back a fresh object on every pass; an identity-keyed
    // tween would replay the zoom on every unrelated update.
    rerender({ state: camera({ zoomLevel: 2, duration: 2 }) });
    expect(result.current.scale).toBe(2);
  });

  it('pans toward the focused character', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: CameraRuntimeState }) => useCameraTransform(
        state,
        [{ characterId: 'char_1', position: 'right' }],
        WIDTH,
      ),
      { initialProps: { state: camera({}) } },
    );

    rerender({ state: camera({ action: 'focus', target: 'char_1', zoomLevel: 1, duration: 1 }) });
    advance(1200);
    expect(result.current.translateX).toBeCloseTo(-250, 5);
  });
});
