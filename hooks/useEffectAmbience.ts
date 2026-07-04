import { useEffect } from 'react';
import { enhancedAudioManager as defaultAudioManager } from '@/lib/audio-manager-enhanced';
import {
  RAIN_AMBIENCE_TRACK_ID,
  THUNDER_TRACK_PREFIX,
  hasThunder,
  isRainSoundEnabled,
  rainLoopVolumeFor,
  rainVariantOf,
  resolveRainLoopUri,
  resolveThunderUri,
  thunderVolumeFor,
} from '@/lib/effect-audio';
import { subscribeToLightning } from '@/lib/engine/lightning-scheduler';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

const THUNDER_MIN_DELAY_MS = 300;
const THUNDER_MAX_DELAY_MS = 1200;

function activeRainWithSound(effects: ActiveEffect[] | undefined): ActiveEffect | null {
  const now = Date.now();
  return (effects ?? [])
    .filter((effect) => isRainSoundEnabled(effect) && effect.endTime > now)
    .sort((a, b) => b.intensity - a.intensity)[0] ?? null;
}

/**
 * Plays the bundled rain ambience loop while a rain effect with sound is
 * active, and thunder claps synced to the shared lightning scheduler.
 */
export function useEffectAmbience(
  activeEffects: ActiveEffect[] | undefined,
  sfxVolume: number,
  enabled: boolean = true,
) {
  const audioManager = defaultAudioManager;
  const rain = enabled ? activeRainWithSound(activeEffects) : null;
  const variant = rain ? rainVariantOf(rain) : 'rain';
  const thunderActive = Boolean(rain && hasThunder(rain));
  const rainKey = rain ? `${rain.startTime}:${rain.endTime}:${variant}` : '';
  const rainStartTime = rain?.startTime ?? 0;
  const rainEndTime = rain?.endTime ?? 0;
  const rainSceneBound = Boolean(rain?.sceneBound);
  const loopVolume = rain ? sfxVolume * rainLoopVolumeFor(rain) : 0;
  const thunderVolume = rain ? sfxVolume * thunderVolumeFor(rain) : 0;
  const fadeInMs = Math.max(200, (rain?.fadeIn ?? 0.8) * 1000);
  const fadeOutMs = Math.max(250, (rain?.fadeOut ?? 0.8) * 1000);

  useEffect(() => {
    if (!rainKey || !rainStartTime) return undefined;

    let disposed = false;
    void resolveRainLoopUri(variant).then((uri) => {
      if (disposed || !uri) return;
      void audioManager
        .play(RAIN_AMBIENCE_TRACK_ID, uri, { volume: loopVolume, loop: true, fadeIn: fadeInMs })
        .catch(() => {});
    });
    // Scene-bound effects loop until the scene changes (cleanup below);
    // a timer with their sentinel endTime would overflow setTimeout and fire at once.
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    if (!rainSceneBound) {
      const stopDelay = Math.max(0, rainEndTime - Date.now() - fadeOutMs);
      stopTimer = setTimeout(() => {
        void audioManager.stop(RAIN_AMBIENCE_TRACK_ID, fadeOutMs);
      }, stopDelay);
    }

    return () => {
      disposed = true;
      if (stopTimer) clearTimeout(stopTimer);
      void audioManager.stop(RAIN_AMBIENCE_TRACK_ID, 400);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rainKey, loopVolume, audioManager]);

  useEffect(() => {
    if (!thunderActive) return undefined;

    let thunderCounter = 0;
    const pending = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = subscribeToLightning(() => {
      // Thunder trails the flash a bit, like distant lightning.
      const delay = THUNDER_MIN_DELAY_MS + Math.random() * (THUNDER_MAX_DELAY_MS - THUNDER_MIN_DELAY_MS);
      const timer = setTimeout(() => {
        pending.delete(timer);
        void resolveThunderUri().then((uri) => {
          if (!uri) return;
          thunderCounter += 1;
          void audioManager
            .play(`${THUNDER_TRACK_PREFIX}${thunderCounter % 2}`, uri, { volume: thunderVolume })
            .catch(() => {});
        });
      }, delay);
      pending.add(timer);
    }, { fast: variant === 'fallout' });

    return () => {
      unsubscribe();
      pending.forEach((timer) => clearTimeout(timer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thunderActive, rainKey, thunderVolume, audioManager]);
}
