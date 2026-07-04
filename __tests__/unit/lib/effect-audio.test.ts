import {
  RAIN_AMBIENCE_TRACK_ID,
  hasThunder,
  isEffectAmbienceTrack,
  isRainSoundEnabled,
  rainLoopVolumeFor,
  rainVariantOf,
  thunderVolumeFor,
} from '@/lib/effect-audio';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

const now = Date.now();

function rainEffect(rain?: ActiveEffect['rain'], effectType: ActiveEffect['effectType'] = 'rain'): ActiveEffect {
  return {
    effectType,
    target: 'screen',
    intensity: 60,
    startTime: now,
    endTime: now + 8000,
    rain,
  };
}

describe('effect-audio', () => {
  it('marks ambience channels so the reader track sweep spares them', () => {
    expect(isEffectAmbienceTrack(RAIN_AMBIENCE_TRACK_ID)).toBe(true);
    expect(isEffectAmbienceTrack('ambience:thunder:1')).toBe(true);
    expect(isEffectAmbienceTrack('sfx:door')).toBe(false);
    expect(isEffectAmbienceTrack('bgm')).toBe(false);
  });

  it('derives the rain variant from options and lightning fallback', () => {
    expect(rainVariantOf(rainEffect({ variant: 'drizzle' }))).toBe('drizzle');
    expect(rainVariantOf(rainEffect({ lightning: true }))).toBe('storm');
    expect(rainVariantOf(rainEffect({}))).toBe('rain');
    expect(rainVariantOf(rainEffect(undefined))).toBe('rain');
  });

  it('treats sound as enabled unless explicitly disabled', () => {
    expect(isRainSoundEnabled(rainEffect({}))).toBe(true);
    expect(isRainSoundEnabled(rainEffect(undefined))).toBe(true);
    expect(isRainSoundEnabled(rainEffect({ sound: false }))).toBe(false);
    expect(isRainSoundEnabled(rainEffect({}, 'snow'))).toBe(false);
  });

  it('detects thunder for storm, fallout, and explicit lightning', () => {
    expect(hasThunder(rainEffect({ variant: 'storm' }))).toBe(true);
    expect(hasThunder(rainEffect({ variant: 'fallout' }))).toBe(true);
    expect(hasThunder(rainEffect({ lightning: true }))).toBe(true);
    expect(hasThunder(rainEffect({ variant: 'drizzle' }))).toBe(false);
    expect(hasThunder(rainEffect({}))).toBe(false);
  });

  it('scales loop volume by variant and per-effect soundVolume', () => {
    const drizzle = rainLoopVolumeFor(rainEffect({ variant: 'drizzle' }));
    const rain = rainLoopVolumeFor(rainEffect({ variant: 'rain' }));
    const storm = rainLoopVolumeFor(rainEffect({ variant: 'storm' }));
    expect(drizzle).toBeLessThan(rain);
    expect(rain).toBeLessThan(storm);

    const halved = rainLoopVolumeFor(rainEffect({ variant: 'rain', soundVolume: 0.5 }));
    expect(halved).toBeCloseTo(rain * 0.5);

    expect(thunderVolumeFor(rainEffect({ soundVolume: 0.5 }))).toBeCloseTo(0.45);
  });
});
