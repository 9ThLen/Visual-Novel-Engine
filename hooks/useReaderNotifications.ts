/**
 * hooks/useReaderNotifications.ts — Scene transition + completion side effects.
 *
 * Extracts transition/complete notification logic from StoryReaderResponsive
 * to reduce its useEffect count.
 */
import { useEffect, useRef } from 'react';
import type { SceneState } from '@/lib/engine/types';

export function useReaderNotifications({
  displaySceneId,
  isTransitioning,
  transitionTarget,
  isComplete,
  routeOnExecutorComplete,
  onTransition,
}: {
  displaySceneId: string;
  isTransitioning: boolean;
  transitionTarget: string | null | undefined,
  isComplete: boolean;
  routeOnExecutorComplete: boolean;
  onTransition: ((targetSceneId: string | null) => void) | undefined;
}) {
  const transitionNotifiedRef = useRef<string | null>(null);
  const completeNotifiedRef = useRef<string | null>(null);

  // Reset notification refs on scene change
  useEffect(() => {
    transitionNotifiedRef.current = null;
    completeNotifiedRef.current = null;
  }, [displaySceneId]);

  // Transition notification
  useEffect(() => {
    if (!isTransitioning) return;
    const target = transitionTarget ?? '__end__';
    const key = `${displaySceneId}:${target}`;
    if (transitionNotifiedRef.current === key) return;
    transitionNotifiedRef.current = key;
    onTransition?.(transitionTarget ?? null);
  }, [displaySceneId, isTransitioning, transitionTarget, onTransition]);

  // Executor complete notification
  useEffect(() => {
    if (!routeOnExecutorComplete || !isComplete) return;
    const key = `${displaySceneId}:complete`;
    if (completeNotifiedRef.current === key) return;
    completeNotifiedRef.current = key;
    onTransition?.(null);
  }, [displaySceneId, isComplete, onTransition, routeOnExecutorComplete]);
}
