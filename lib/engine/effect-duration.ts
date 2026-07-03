import type { EffectType } from './types';
import type { ActiveEffect, RuntimeEffectType } from './runtime-types';

type AnyEffectType = EffectType | RuntimeEffectType;

export const BLOCKING_EFFECT_TYPES = new Set<AnyEffectType>(['rain', 'snow', 'fog']);

export function isBlockingEffectType(effectType: AnyEffectType): boolean {
  return BLOCKING_EFFECT_TYPES.has(effectType);
}

export function getDefaultEffectDuration(effectType: AnyEffectType): number {
  if (isBlockingEffectType(effectType)) return 8;
  if (effectType === 'flash') return 0.35;
  return 0.8;
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
    .filter((effect) => isBlockingEffectType(effect.effectType) && effect.endTime > now)
    .map((effect) => effect.endTime);

  return endTimes.length > 0 ? Math.min(...endTimes) : null;
}

export function hasActiveBlockingEffect(
  effects: ActiveEffect[] | undefined,
  now: number = Date.now(),
): boolean {
  return getNextBlockingEffectEndTime(effects, now) !== null;
}
