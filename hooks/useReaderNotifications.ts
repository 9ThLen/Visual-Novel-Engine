/**
 * hooks/useReaderNotifications.ts — Scene transition + completion side effects.
 *
 * Extracts transition/complete notification logic from StoryReaderResponsive
 * to reduce its useEffect count.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getNextBlockingEffectEndTime } from '@/lib/engine/effect-duration';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

export function useReaderNotifications({
  displaySceneId,
  isTransitioning,
  transitionTarget,
  isComplete,
  activeEffects = [],
  routeOnExecutorComplete,
  onTransition,
}: {
  displaySceneId: string;
  isTransitioning: boolean;
  transitionTarget: string | null | undefined,
  isComplete: boolean;
  activeEffects?: ActiveEffect[];
  routeOnExecutorComplete: boolean;
  onTransition: ((targetSceneId: string | null) => void) | undefined;
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
    const target = transitionTarget ?? '__end__';
    const key = `${displaySceneId}:${target}`;
    if (transitionNotifiedRef.current === key) return;
    transitionNotifiedRef.current = key;
    onTransition?.(transitionTarget ?? null);
  }, [displaySceneId, hasActiveBlockingEffect, isTransitioning, transitionTarget, onTransition]);

  // Executor complete notification
  useEffect(() => {
    if (!routeOnExecutorComplete || !isComplete) return;
    if (hasActiveBlockingEffect) return;
    const key = `${displaySceneId}:complete`;
    if (completeNotifiedRef.current === key) return;
    completeNotifiedRef.current = key;
    onTransition?.(null);
  }, [displaySceneId, hasActiveBlockingEffect, isComplete, onTransition, routeOnExecutorComplete]);
}
