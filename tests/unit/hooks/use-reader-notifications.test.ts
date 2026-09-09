import { act, renderHook } from '@testing-library/react';
import { useReaderNotifications } from '@/hooks/useReaderNotifications';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

function rainEffect(endTime: number): ActiveEffect {
  return {
    effectType: 'rain',
    target: 'screen',
    intensity: 60,
    startTime: 1000,
    endTime,
  };
}

function sceneBoundRainEffect(): ActiveEffect {
  return {
    ...rainEffect(Number.MAX_SAFE_INTEGER),
    durationMode: 'scene',
    sceneBound: true,
  };
}

describe('useReaderNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays executor completion while a blocking weather effect is active', async () => {
    const onTransition = vi.fn();

    renderHook(() => useReaderNotifications({
      displaySceneId: 'scene-1',
      isTransitioning: false,
      transitionTarget: null,
      isComplete: true,
      activeEffects: [rainEffect(2000)],
      routeOnExecutorComplete: true,
      onTransition,
    }));

    expect(onTransition).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onTransition).toHaveBeenCalledWith(null, { mode: 'next', transitionType: 'fade', durationSec: 0.5 });
  });

  it('delays scene transitions while a blocking weather effect is active', async () => {
    const onTransition = vi.fn();

    renderHook(() => useReaderNotifications({
      displaySceneId: 'scene-1',
      isTransitioning: true,
      transitionTarget: 'scene-2',
      isComplete: false,
      activeEffects: [rainEffect(1500)],
      routeOnExecutorComplete: true,
      onTransition,
    }));

    expect(onTransition).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onTransition).toHaveBeenCalledWith('scene-2', { mode: 'scene', transitionType: 'fade', durationSec: 0.5 });
  });

  it('does not delay completion for scene-bound weather effects', async () => {
    const onTransition = vi.fn();

    renderHook(() => useReaderNotifications({
      displaySceneId: 'scene-1',
      isTransitioning: false,
      transitionTarget: null,
      isComplete: true,
      activeEffects: [sceneBoundRainEffect()],
      routeOnExecutorComplete: true,
      onTransition,
    }));

    expect(onTransition).toHaveBeenCalledWith(null, { mode: 'next', transitionType: 'fade', durationSec: 0.5 });
  });
});
