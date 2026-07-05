/**
 * hooks/useReaderNotifications.ts — Scene transition + completion side effects.
 *
 * Extracts transition/complete notification logic from StoryReaderResponsive
 * to reduce its useEffect count.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getNextBlockingEffectEndTime } from '@/lib/engine/effect-duration';
import type { ActiveEffect } from '@/lib/engine/runtime-types';
import type { TransitionMode, TransitionType } from '@/lib/engine/types';
import {
  DEFAULT_TRANSITION_DURATION_SEC,
  DEFAULT_TRANSITION_TYPE,
} from '@/lib/engine/transition-utils';
import type { ReaderTransitionEvent } from '@/lib/reader-runtime';

export function useReaderNotifications({
  displaySceneId,
  isTransitioning,
  transitionTarget,
  transitionMode,
  transitionType,
  transitionDuration,
  isComplete,
  activeEffects = [],
  routeOnExecutorComplete,
  onTransition,
}: {
  displaySceneId: string;
  isTransitioning: boolean;
  transitionTarget: string | null | undefined,
  transitionMode?: TransitionMode;
  transitionType?: TransitionType;
  transitionDuration?: number;
  isComplete: boolean;
  activeEffects?: ActiveEffect[];
  routeOnExecutorComplete: boolean;
  onTransition: ((targetSceneId: string | null, transition?: ReaderTransitionEvent) => void) | undefined;
}) {
  const transitionNotifiedRef = useRef<string | null>(null);
  const completeNotifiedRef = useRef<string | null>(null);
  const [gateTick, setGateTick] = useState(0);
  const nextBlockingEffectEndTime = useMemo(
    () => getNextBlockingEffectEndTime(activeEffects),
    [activeEffects, gateTick],
  );
  const hasActiveBlockingEffect = nextBlockingEffectEndTime !== null;

  // Reset notification refs on scene change
  useEffect(() => {
    transitionNotifiedRef.current = null;
    completeNotifiedRef.current = null;
  }, [displaySceneId]);

  useEffect(() => {
    if (nextBlockingEffectEndTime === null) return;
    const delay = Math.max(16, nextBlockingEffectEndTime - Date.now());
    const timer = setTimeout(() => setGateTick((tick) => tick + 1), delay);
    return () => clearTimeout(timer);
  }, [nextBlockingEffectEndTime]);

  // Transition notification
  useEffect(() => {
    if (!isTransitioning) return;
    if (hasActiveBlockingEffect) return;
    const mode: TransitionMode = transitionMode ?? (transitionTarget ? 'scene' : 'next');
    const key = `${displaySceneId}:${mode}:${transitionTarget ?? '__none__'}`;
    if (transitionNotifiedRef.current === key) return;
    transitionNotifiedRef.current = key;
    onTransition?.(transitionTarget ?? null, {
      mode,
      transitionType: transitionType ?? DEFAULT_TRANSITION_TYPE,
      durationSec: transitionDuration ?? DEFAULT_TRANSITION_DURATION_SEC,
    });
  }, [displaySceneId, hasActiveBlockingEffect, isTransitioning, transitionTarget, transitionMode, transitionType, transitionDuration, onTransition]);

  // Executor complete notification — the scene ran out of steps without an
  // explicit transition block; follow the scene's next connection if any.
  useEffect(() => {
    if (!routeOnExecutorComplete || !isComplete) return;
    if (hasActiveBlockingEffect) return;
    const key = `${displaySceneId}:complete`;
    if (completeNotifiedRef.current === key) return;
    completeNotifiedRef.current = key;
    onTransition?.(null, {
      mode: 'next',
      transitionType: DEFAULT_TRANSITION_TYPE,
      durationSec: DEFAULT_TRANSITION_DURATION_SEC,
    });
  }, [displaySceneId, hasActiveBlockingEffect, isComplete, onTransition, routeOnExecutorComplete]);
}
