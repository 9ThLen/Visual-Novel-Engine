/**
 * lib/engine/transition-utils.ts — canonical contract for the transition block.
 *
 * A transition block ends the current scene in one of three explicit modes:
 *   'next'  — follow the scene's `next` connection (document order); end the
 *             story if no connection exists.
 *   'scene' — jump to `targetSceneId`; end the story if the target is missing.
 *   'end'   — end the story, even when a `next` connection exists.
 *
 * Legacy data stored only `targetSceneId` where `null` ambiguously meant
 * "next connection" (reader-runtime) or "end" (reader screen). Migration:
 * a non-null target becomes mode 'scene', a null target becomes mode 'next'
 * — matching what the runtime actually did.
 */

import type { TransitionBlockData, TransitionMode, TransitionType } from './types';

export const TRANSITION_MODES: TransitionMode[] = ['next', 'scene', 'end'];
export const TRANSITION_TYPES: TransitionType[] = ['fade', 'slide', 'instant'];

export const DEFAULT_TRANSITION_TYPE: TransitionType = 'fade';
export const DEFAULT_TRANSITION_DURATION_SEC = 0.5;

/** Legacy transitionType values collapsed onto the implemented set. */
const LEGACY_TYPE_MAP: Record<string, TransitionType> = {
  fade: 'fade',
  dissolve: 'fade',
  wipe: 'fade',
  slide: 'slide',
  'slide-left': 'slide',
  'slide-right': 'slide',
  'slide-up': 'slide',
  instant: 'instant',
  cut: 'instant',
};

export function normalizeTransitionType(value: unknown): TransitionType {
  if (typeof value === 'string' && LEGACY_TYPE_MAP[value]) return LEGACY_TYPE_MAP[value];
  return DEFAULT_TRANSITION_TYPE;
}

export function normalizeTransitionMode(value: unknown, targetSceneId: string | null): TransitionMode {
  if (value === 'next' || value === 'scene' || value === 'end') return value;
  return targetSceneId ? 'scene' : 'next';
}

export function normalizeTransitionData(raw: unknown): TransitionBlockData {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const targetSceneId = typeof record.targetSceneId === 'string' && record.targetSceneId.trim()
    ? record.targetSceneId
    : null;
  const mode = normalizeTransitionMode(record.mode, targetSceneId);
  const duration = Number(record.duration);
  return {
    mode,
    targetSceneId: mode === 'scene' ? targetSceneId : null,
    transitionType: normalizeTransitionType(record.transitionType),
    duration: Number.isFinite(duration) && duration >= 0 ? duration : DEFAULT_TRANSITION_DURATION_SEC,
  };
}
