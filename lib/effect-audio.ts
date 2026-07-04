import { Asset } from 'expo-asset';
import type { RainEffectVariant } from './engine/effect-options';
import type { ActiveEffect } from './engine/runtime-types';

// Bundled procedural ambience (see assets/sounds/rain-loop-*.wav, thunder-*.wav).
const RAIN_LOOP_LIGHT = require('../assets/sounds/rain-loop-light.wav');
const RAIN_LOOP_HEAVY = require('../assets/sounds/rain-loop-heavy.wav');
const THUNDER_MODULES: number[] = [
  require('../assets/sounds/thunder-1.wav'),
  require('../assets/sounds/thunder-2.wav'),
];

export const RAIN_AMBIENCE_TRACK_ID = 'ambience:rain';
export const THUNDER_TRACK_PREFIX = 'ambience:thunder:';

/** Ambience channels live as long as their effect, not the scene step —
 * they must survive the per-step track sweep in useReaderAudio. */
export function isEffectAmbienceTrack(trackId: string): boolean {
  return trackId.startsWith('ambience:');
}

const uriCache = new Map<number, string>();

async function resolveBundledSoundUri(module: number): Promise<string | null> {
  const cached = uriCache.get(module);
  if (cached) return cached;
  try {
    const asset = Asset.fromModule(module);
    if (!asset.localUri) await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri ?? null;
    if (uri) uriCache.set(module, uri);
    return uri;
  } catch {
    return null;
  }
}

export function rainVariantOf(effect: ActiveEffect): RainEffectVariant {
  return effect.rain?.variant ?? (effect.rain?.lightning ? 'storm' : 'rain');
}

export function isRainSoundEnabled(effect: ActiveEffect): boolean {
  return effect.effectType === 'rain' && effect.rain?.sound !== false;
}

export function hasThunder(effect: ActiveEffect): boolean {
  const variant = rainVariantOf(effect);
  return Boolean(effect.rain?.lightning) || variant === 'storm' || variant === 'fallout';
}

export function rainLoopVolumeFor(effect: ActiveEffect): number {
  const variant = rainVariantOf(effect);
  const base = variant === 'drizzle' ? 0.45 : variant === 'rain' ? 0.7 : 0.85;
  return base * (effect.rain?.soundVolume ?? 1);
}

export function thunderVolumeFor(effect: ActiveEffect): number {
  return 0.9 * (effect.rain?.soundVolume ?? 1);
}

export async function resolveRainLoopUri(variant: RainEffectVariant): Promise<string | null> {
  return resolveBundledSoundUri(variant === 'drizzle' ? RAIN_LOOP_LIGHT : RAIN_LOOP_HEAVY);
}

export async function resolveThunderUri(): Promise<string | null> {
  const module = THUNDER_MODULES[Math.floor(Math.random() * THUNDER_MODULES.length)];
  return resolveBundledSoundUri(module);
}
