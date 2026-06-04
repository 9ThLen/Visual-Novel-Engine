import { renderHook, act } from '@testing-library/react';

import { useReaderAutoAdvance } from '../../../hooks/useReaderAutoAdvance';
import type { AutoAdvanceExecutor } from '../../../hooks/useReaderAutoAdvance';

function createExecutor(overrides: Partial<AutoAdvanceExecutor> = {}): AutoAdvanceExecutor {
  return {
    canAdvance: true,
    isTyping: false,
    isComplete: false,
    sceneState: { isTransitioning: false, currentChoices: undefined },
    advance: vi.fn(),
    ...overrides,
  };
}

describe('useReaderAutoAdvance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('auto-play', () => {
    it('does not auto-advance when not active', () => {
      const executor = createExecutor();
      renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { vi.advanceTimersByTime(5000); });
      expect(executor.advance).not.toHaveBeenCalled();
    });

    it('auto-advances after delay when active and not typing', () => {
      const executor = createExecutor();
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: true,
          pageIndex: 0,
        }),
      );
      expect(result.current.autoPlayActive).toBe(true);
      act(() => { vi.advanceTimersByTime(2400); });
      expect(executor.advance).toHaveBeenCalledTimes(1);
    });

    it('does not auto-advance while typing', () => {
      const executor = createExecutor();
      const { rerender } = renderHook(
        ({ isTyping }) =>
          useReaderAutoAdvance({
            isLoading: false,
            isTyping,
            hasChoices: false,
            executor,
            completeTypewriter: vi.fn(),
            initialAutoPlay: true,
            pageIndex: 0,
          }),
        { initialProps: { isTyping: true } },
      );
      act(() => { vi.advanceTimersByTime(5000); });
      expect(executor.advance).not.toHaveBeenCalled();

      rerender({ isTyping: false });
      act(() => { vi.advanceTimersByTime(2400); });
      expect(executor.advance).toHaveBeenCalledTimes(1);
    });

    it('does not auto-advance when choices are present', () => {
      const executor = createExecutor();
      renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: true,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: true,
          pageIndex: 0,
        }),
      );
      act(() => { vi.advanceTimersByTime(5000); });
      expect(executor.advance).not.toHaveBeenCalled();
    });

    it('does not auto-advance when canAdvance is false', () => {
      const executor = createExecutor({ canAdvance: false });
      renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: true,
          pageIndex: 0,
        }),
      );
      act(() => { vi.advanceTimersByTime(5000); });
      expect(executor.advance).not.toHaveBeenCalled();
    });

    it('toggleAutoPlay flips state', () => {
      const executor = createExecutor();
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      expect(result.current.autoPlayActive).toBe(false);
      act(() => { result.current.toggleAutoPlay(); });
      expect(result.current.autoPlayActive).toBe(true);
      act(() => { result.current.toggleAutoPlay(); });
      expect(result.current.autoPlayActive).toBe(false);
    });
  });

  describe('turbo', () => {
    it('does not advance when not active', () => {
      const executor = createExecutor();
      renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { vi.advanceTimersByTime(2000); });
      expect(executor.advance).not.toHaveBeenCalled();
    });

    it('advances on interval when active and not typing', () => {
      const executor = createExecutor();
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { result.current.setTurbo(true); });
      act(() => { vi.advanceTimersByTime(320 * 3); });
      expect(executor.advance).toHaveBeenCalledTimes(3);
    });

    it('completes typewriter and advances when typing', () => {
      const executor = createExecutor({ isTyping: true });
      const completeTypewriter = vi.fn();
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: true,
          hasChoices: false,
          executor,
          completeTypewriter,
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { result.current.setTurbo(true); });
      act(() => { vi.advanceTimersByTime(320); });
      expect(completeTypewriter).toHaveBeenCalled();
      expect(executor.advance).toHaveBeenCalled();
    });

    it('disables itself when cannot advance', () => {
      const executor = createExecutor({ canAdvance: false });
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { result.current.setTurbo(true); });
      act(() => { vi.advanceTimersByTime(320); });
      expect(result.current.turbo).toBe(false);
    });
  });

  describe('handleTapAdvance', () => {
    it('does nothing when loading', () => {
      const executor = createExecutor();
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: true,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { result.current.handleTapAdvance(); });
      expect(executor.advance).not.toHaveBeenCalled();
    });

    it('completes typewriter and advances when typing', () => {
      const executor = createExecutor({ isTyping: true });
      const completeTypewriter = vi.fn();
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: true,
          hasChoices: false,
          executor,
          completeTypewriter,
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { result.current.handleTapAdvance(); });
      expect(completeTypewriter).toHaveBeenCalled();
      expect(executor.advance).toHaveBeenCalled();
    });

    it('advances when canAdvance', () => {
      const executor = createExecutor();
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { result.current.handleTapAdvance(); });
      expect(executor.advance).toHaveBeenCalledTimes(1);
    });

    it('does not advance when transitioning', () => {
      const executor = createExecutor({ sceneState: { isTransitioning: true, currentChoices: undefined } });
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: false,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { result.current.handleTapAdvance(); });
      expect(executor.advance).not.toHaveBeenCalled();
    });

    it('does not advance when choices are pending', () => {
      const executor = createExecutor({ canAdvance: false, sceneState: { isTransitioning: false, currentChoices: [{ id: 'c1' }] } });
      const { result } = renderHook(() =>
        useReaderAutoAdvance({
          isLoading: false,
          isTyping: false,
          hasChoices: true,
          executor,
          completeTypewriter: vi.fn(),
          initialAutoPlay: false,
          pageIndex: 0,
        }),
      );
      act(() => { result.current.handleTapAdvance(); });
      expect(executor.advance).not.toHaveBeenCalled();
    });
  });
});
