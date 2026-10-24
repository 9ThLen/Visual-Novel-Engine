import { act, renderHook } from '@testing-library/react';
import { useReaderNotifications } from '@/hooks/useReaderNotifications';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

type NotificationProps = Parameters<typeof useReaderNotifications>[0];

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

  // A choice that is the scene's last step leaves the run both transitioning
  // and complete in one update. The reader must hear only where the choice
  // leads: a second, "next" report would follow the scene's next connection or
  // end the story while the first navigation is still loading.
  it('reports a choice at the scene\'s end once, as the scene it leads to', () => {
    const onTransition = vi.fn();

    renderHook(() => useReaderNotifications({
      displaySceneId: 'scene-1',
      isTransitioning: true,
      transitionTarget: 'scene-2',
      transitionMode: 'scene',
      isComplete: true,
      routeOnExecutorComplete: true,
      onTransition,
    }));

    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onTransition).toHaveBeenCalledWith('scene-2', { mode: 'scene', transitionType: 'fade', durationSec: 0.5 });
  });

  it('does not report the scene complete after a transition, even a render later', () => {
    const onTransition = vi.fn();
    const props: NotificationProps = {
      displaySceneId: 'scene-1',
      isTransitioning: true,
      transitionTarget: null,
      transitionMode: 'end',
      isComplete: false,
      routeOnExecutorComplete: true,
      onTransition,
    };

    const { rerender } = renderHook((current) => useReaderNotifications(current), { initialProps: props });
    rerender({ ...props, isComplete: true });

    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onTransition).toHaveBeenCalledWith(null, { mode: 'end', transitionType: 'fade', durationSec: 0.5 });
  });

  it('reports the next scene complete again, after a transition in the scene before', () => {
    const onTransition = vi.fn();
    const props: NotificationProps = {
      displaySceneId: 'scene-1',
      isTransitioning: true,
      transitionTarget: 'scene-2',
      transitionMode: 'scene',
      isComplete: true,
      routeOnExecutorComplete: true,
      onTransition,
    };

    const { rerender } = renderHook((current) => useReaderNotifications(current), { initialProps: props });
    rerender({ ...props, displaySceneId: 'scene-2', isTransitioning: false, transitionTarget: null, transitionMode: undefined });

    expect(onTransition).toHaveBeenCalledTimes(2);
    expect(onTransition).toHaveBeenLastCalledWith(null, { mode: 'next', transitionType: 'fade', durationSec: 0.5 });
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
