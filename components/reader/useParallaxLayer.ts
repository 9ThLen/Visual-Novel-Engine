import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  cancelAnimation,
  Easing,
  makeMutable,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export interface ParallaxLayerConfig {
  /** Max horizontal shift in px at full pointer deflection. Sign sets direction. */
  shiftX: number;
  /** Max vertical shift in px at full pointer deflection. Sign sets direction. */
  shiftY: number;
  /** Slight zoom so full-bleed layers never reveal their edges when shifted. */
  overscan?: number;
}

/**
 * Depth presets: the background drifts against the pointer while nearer
 * layers follow it, so every pair of layers moves relative to each other.
 */
export const PARALLAX_LAYERS = {
  background: { shiftX: -14, shiftY: -9, overscan: 1.08 },
  characters: { shiftX: 7, shiftY: 5 },
  hud: { shiftX: 3, shiftY: 2 },
  menu: { shiftX: 5, shiftY: 4 },
} as const satisfies Record<string, ParallaxLayerConfig>;

// A soft, overdamped spring: the offset gradually gains speed toward the
// pointer and eases to a stop, carrying velocity across pointer events so
// direction changes never snap. No overshoot (damping >> critical).
const POINTER_SPRING = {
  mass: 1,
  stiffness: 42,
  damping: 26,
  reduceMotion: ReduceMotion.Never,
} as const;
const TOGGLE_MS = 300;
const DRIFT_PERIOD_X_MS = 11000;
const DRIFT_PERIOD_Y_MS = 15000;

/** Normalize a pointer coordinate to [-1, 1] relative to the viewport center. */
export function pointerToParallaxOffset(position: number, extent: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(extent) || extent <= 0) return 0;
  return Math.max(-1, Math.min(1, (position / extent) * 2 - 1));
}

// One driver feeds every parallax layer so they stay in phase: normalized
// [-1, 1] offsets driven by the pointer on web and by a slow ambient drift
// on native (the project has no motion-sensor dependency).
const driverOffsetX = makeMutable(0);
const driverOffsetY = makeMutable(0);
let driverConsumers = 0;
let stopDriver: (() => void) | null = null;

function startDriver(): () => void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const handlePointerMove = (event: PointerEvent) => {
      driverOffsetX.value = withSpring(
        pointerToParallaxOffset(event.clientX, window.innerWidth),
        POINTER_SPRING,
      );
      driverOffsetY.value = withSpring(
        pointerToParallaxOffset(event.clientY, window.innerHeight),
        POINTER_SPRING,
      );
    };
    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }

  const drift = (periodMs: number) =>
    withRepeat(
      withSequence(
        withTiming(1, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }),
        withTiming(-1, { duration: periodMs, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }),
        withTiming(0, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }),
      ),
      -1,
      false,
    );
  driverOffsetX.value = drift(DRIFT_PERIOD_X_MS);
  driverOffsetY.value = drift(DRIFT_PERIOD_Y_MS);
  return () => {
    cancelAnimation(driverOffsetX);
    cancelAnimation(driverOffsetY);
  };
}

function retainDriver(): () => void {
  driverConsumers += 1;
  if (driverConsumers === 1) stopDriver = startDriver();
  return () => {
    driverConsumers -= 1;
    if (driverConsumers === 0) {
      stopDriver?.();
      stopDriver = null;
      driverOffsetX.value = withTiming(0, { duration: TOGGLE_MS, reduceMotion: ReduceMotion.Never });
      driverOffsetY.value = withTiming(0, { duration: TOGGLE_MS, reduceMotion: ReduceMotion.Never });
    }
  };
}

/**
 * Parallax transform for one reader layer. All layers share a single offset
 * driver; `config` scales it per depth. Returns a reanimated style for a view
 * wrapping the layer's content. Toggling `enabled` fades the effect in/out.
 */
export function useParallaxLayer(enabled: boolean, config: ParallaxLayerConfig) {
  const progress = useSharedValue(0);
  const { shiftX, shiftY, overscan = 1 } = config;

  useEffect(() => {
    progress.value = withTiming(enabled ? 1 : 0, { duration: TOGGLE_MS, reduceMotion: ReduceMotion.Never });
    if (!enabled) return undefined;
    return retainDriver();
  }, [enabled, progress]);

  return useAnimatedStyle(() => ({
    transform: [
      { translateX: driverOffsetX.value * shiftX * progress.value },
      { translateY: driverOffsetY.value * shiftY * progress.value },
      { scale: 1 + (overscan - 1) * progress.value },
    ],
  }));
}
