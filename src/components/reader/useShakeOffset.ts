import { useEffect, useState } from 'react';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

const SHAKE_TICK_MS = 55;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function strongestShakeEffect(effects: ActiveEffect[]): ActiveEffect | null {
  return effects
    .filter((effect) => effect.effectType === 'shake')
    .sort((a, b) => b.intensity - a.intensity)[0] ?? null;
}

/**
 * Oscillating screen-shake offset with decay toward the effect's end.
 * Plain numbers so it works inside both reanimated and RN styles.
 */
export function useShakeOffset(effects: ActiveEffect[]): { x: number; y: number } {
  const shake = strongestShakeEffect(effects);
  const startTime = shake?.startTime ?? 0;
  const endTime = shake?.endTime ?? 0;
  const intensity = shake?.intensity ?? 0;
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!startTime || endTime <= startTime) {
      setOffset({ x: 0, y: 0 });
      return undefined;
    }
    const tick = () => {
      const now = Date.now();
      if (now >= endTime) {
        setOffset({ x: 0, y: 0 });
        clearInterval(interval);
        return;
      }
      const progress = clamp((now - startTime) / (endTime - startTime), 0, 1);
      const amplitude = Math.max(1.5, intensity / 6) * (1 - progress);
      setOffset({
        x: (Math.random() * 2 - 1) * amplitude,
        y: (Math.random() * 2 - 1) * amplitude * 0.6,
      });
    };
    const interval = setInterval(tick, SHAKE_TICK_MS);
    tick();
    return () => clearInterval(interval);
  }, [startTime, endTime, intensity]);

  return offset;
}
