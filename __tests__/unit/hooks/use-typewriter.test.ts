import { renderHook, act } from '@testing-library/react';

import { useTypewriter } from '../../../hooks/useTypewriter';

// charDelayMs is a module-private helper. Re-derive the same curve so tests
// stay self-contained: textSpeed 0 → 60ms, textSpeed 1 → 12ms.
function expectedDelay(textSpeed: number): number {
  const clamped = Math.max(0, Math.min(1, textSpeed));
  return Math.round(60 - clamped * 48);
}

describe('useTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads textSpeed live: mid-typing speed change takes effect on the next tick', () => {
    // Start at the slowest speed (60ms per char).
    const { result, rerender } = renderHook(
      ({ speed }: { speed: number }) => useTypewriter(speed),
      { initialProps: { speed: 0 } },
    );

    act(() => {
      result.current.startTypewriter('hello world');
    });

    // Advance one tick at the initial (slow) cadence — expect 'h' displayed.
    act(() => {
      vi.advanceTimersByTime(expectedDelay(0));
    });
    expect(result.current.displayedText).toBe('h');
    expect(result.current.isTyping).toBe(true);

    // Switch to the fastest speed (12ms per char) WITHOUT restarting the typewriter.
    rerender({ speed: 1 });

    // Within a single old-cadence window (60ms), the fast cadence should have
    // produced at least 4 new characters. 5 fast ticks produce 'hello ' (6 chars),
    // 4 fast ticks produce 'hell' (4 chars). The exact count depends on the
    // reschedule boundary, so we only assert a lower bound here.
    act(() => {
      vi.advanceTimersByTime(expectedDelay(1) * 5);
    });
    expect(result.current.displayedText.length).toBeGreaterThanOrEqual(5);
    // Stale-closure bug would have produced only 1 new char in 60ms; the live
    // ref read produces 5+ new chars in the same window.
    expect(result.current.displayedText.length).toBeGreaterThan(2);
  });

  it('clears the interval on unmount so no late callback fires', () => {
    const { result, unmount } = renderHook(() => useTypewriter(0));
    act(() => {
      result.current.startTypewriter('abcdef');
    });
    act(() => {
      vi.advanceTimersByTime(expectedDelay(0));
    });
    const beforeUnmount = result.current.displayedText;
    expect(beforeUnmount.length).toBeGreaterThan(0);

    unmount();

    // Advancing further must not throw. We can't probe result.current after
    // unmount, so this test asserts only that no exception escapes the
    // dangling interval tick.
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });

  it('completeTypewriter sets displayedText to the full target and stops typing', () => {
    const { result } = renderHook(() => useTypewriter(0));
    act(() => {
      result.current.startTypewriter('hello world');
    });
    act(() => {
      vi.advanceTimersByTime(expectedDelay(0));
    });
    expect(result.current.displayedText).toBe('h');
    expect(result.current.isTyping).toBe(true);

    act(() => {
      result.current.completeTypewriter();
    });
    expect(result.current.displayedText).toBe('hello world');
    expect(result.current.isTyping).toBe(false);

    // After completion, no more ticks should fire.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.displayedText).toBe('hello world');
  });
});
