/**
 * useReaderAutoAdvance — auto-play, turbo skip, and tap advance state machine.
 *
 * Encapsulates the "advance the story" logic for the reader:
 * - autoPlayActive: timer-based advance after typewriter completes
 * - turbo: aggressive 320ms interval that completes text and advances
 * - handleTapAdvance: tap to advance (or complete text if typing)
 *
 * Owns its own cleanup so the parent doesn't need to manage intervals/timeouts.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

const AUTO_PLAY_DELAY_MS = 2400;
const TURBO_INTERVAL_MS = 320;

export interface AutoAdvanceExecutor {
  canAdvance: boolean;
  isTyping: boolean;
  isComplete: boolean;
  sceneState: { isTransitioning: boolean; currentChoices?: unknown };
  advance: () => void;
}

export interface UseReaderAutoAdvanceParams {
  isLoading: boolean;
  isTyping: boolean;
  hasChoices: boolean;
  executor: AutoAdvanceExecutor;
  completeTypewriter: () => void;
  initialAutoPlay: boolean;
  pageIndex: number;
}

export function useReaderAutoAdvance(params: UseReaderAutoAdvanceParams) {
  const { isLoading, isTyping, hasChoices, executor, completeTypewriter, initialAutoPlay, pageIndex } = params;

  const [autoPlayActive, setAutoPlayActive] = useState(initialAutoPlay);
  const [turbo, setTurbo] = useState(false);
  const autoPlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turboInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auto-play: schedule advance after delay if active + not typing + no choices ──
  useEffect(() => {
    if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    if (!autoPlayActive || isTyping) return;

    autoPlayTimer.current = setTimeout(() => {
      if (hasChoices) return;
      if (executor.canAdvance) executor.advance();
    }, AUTO_PLAY_DELAY_MS);

    return () => {
      if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    };
  }, [autoPlayActive, isTyping, hasChoices, executor, pageIndex]);

  // ── Turbo: aggressive 320ms interval while active ──
  useEffect(() => {
    if (!turbo) {
      if (turboInterval.current) clearInterval(turboInterval.current);
      return;
    }
    turboInterval.current = setInterval(() => {
      if (isTyping) {
        completeTypewriter();
        if (executor.isTyping) {
          executor.advance();
        }
      } else {
        if (executor.canAdvance) {
          executor.advance();
        } else {
          setTurbo(false);
        }
      }
    }, TURBO_INTERVAL_MS);

    return () => {
      if (turboInterval.current) clearInterval(turboInterval.current);
    };
  }, [turbo, isTyping, executor, completeTypewriter]);

  // ── Tap advance: complete text if typing, else advance if can ──
  const handleTapAdvance = useCallback(() => {
    if (isLoading) return;
    if (isTyping) {
      completeTypewriter();
      if (executor.isTyping) {
        executor.advance();
      }
      return;
    }
    if (executor.sceneState.isTransitioning) return;
    if (executor.canAdvance) {
      executor.advance();
      return;
    }
    if (executor.sceneState.currentChoices) return;
  }, [isLoading, isTyping, completeTypewriter, executor]);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlayActive((a) => !a);
  }, []);

  return {
    autoPlayActive,
    setAutoPlayActive,
    turbo,
    setTurbo,
    toggleAutoPlay,
    handleTapAdvance,
  };
}
