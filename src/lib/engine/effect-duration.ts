import type { EffectType } from './types';
import type { ActiveEffect, RuntimeEffectType } from './runtime-types';

type AnyEffectType = EffectType | RuntimeEffectType;
export type EffectDurationMode = 'scene' | 'timed';

export const BLOCKING_EFFECT_TYPES = new Set<AnyEffectType>(['rain', 'snow', 'fog']);
export const SCENE_BOUND_END_TIME = Number.MAX_SAFE_INTEGER;

export function isBlockingEffectType(effectType: AnyEffectType): boolean {
  return BLOCKING_EFFECT_TYPES.has(effectType);
}

export function getDefaultEffectDuration(effectType: AnyEffectType): number {
  if (isBlockingEffectType(effectType)) return 8;
  if (effectType === 'flash') return 0.35;
  return 0.8;
}

export function getDefaultEffectDurationMode(effectType: AnyEffectType): EffectDurationMode {
  return isBlockingEffectType(effectType) ? 'scene' : 'timed';
}

export function normalizeEffectDurationMode(
  effectType: AnyEffectType,
  durationMode: EffectDurationMode | null | undefined,
  duration?: number | null,
): EffectDurationMode {
  if (durationMode === 'scene' || durationMode === 'timed') return durationMode;
  if (!isBlockingEffectType(effectType)) return 'timed';

  const value = Number(duration);
  const defaultDuration = getDefaultEffectDuration(effectType);
  return Number.isFinite(value) && value > 0 && Math.abs(value - defaultDuration) > 0.001
    ? 'timed'
    : 'scene';
}

export function normalizeEffectDuration(effectType: AnyEffectType, duration: number | null | undefined): number {
  const value = Number(duration);
  return Number.isFinite(value) && value > 0
    ? value
    : getDefaultEffectDuration(effectType);
}

export function getNextBlockingEffectEndTime(
  effects: ActiveEffect[] | undefined,
  now: number = Date.now(),
): number | null {
  const endTimes = (effects ?? [])
    .filter((effect) => !effect.sceneBound && isBlockingEffectType(effect.effectType) && effect.endTime > now)
    .map((effect) => effect.endTime);

  return endTimes.length > 0 ? Math.min(...endTimes) : null;
}

export function hasActiveBlockingEffect(
  effects: ActiveEffect[] | undefined,
  now: number = Date.now(),
): boolean {
  return getNextBlockingEffectEndTime(effects, now) !== null;
}
