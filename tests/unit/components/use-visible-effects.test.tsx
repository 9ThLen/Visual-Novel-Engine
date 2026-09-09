import { act, renderHook } from '@testing-library/react';
import { useVisibleEffects } from '@/components/reader/useVisibleEffects';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

function effect(overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  return {
    effectType: 'rain',
    target: 'screen',
    intensity: 60,
    startTime: 1000,
    endTime: 9000,
    ...overrides,
  };
}

describe('useVisibleEffects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps scene-bound effects visible after their technical end time', () => {
    const { result } = renderHook(() => useVisibleEffects([
      effect({
        durationMode: 'scene',
        sceneBound: true,
      }),
    ]));

    expect(result.current).toHaveLength(1);

    act(() => {
      vi.setSystemTime(12000);
      vi.advanceTimersByTime(11000);
    });

    expect(result.current).toHaveLength(1);
  });

  it('removes timed effects after endTime', () => {
    const { result } = renderHook(() => useVisibleEffects([
      effect({
        durationMode: 'timed',
        sceneBound: false,
      }),
    ]));

    expect(result.current).toHaveLength(1);

    act(() => {
      vi.setSystemTime(9020);
      vi.advanceTimersByTime(8020);
    });

    expect(result.current).toHaveLength(0);
  });
});
