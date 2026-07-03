import { useEffect, useMemo, useState } from 'react';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

export function useVisibleEffects(activeEffects: ActiveEffect[]): ActiveEffect[] {
  const [now, setNow] = useState(() => Date.now());
  const effectsSignature = useMemo(
    () => activeEffects
      .map((effect) => `${effect.effectType}:${effect.target}:${effect.characterId ?? ''}:${effect.startTime}:${effect.endTime}`)
      .join('|'),
    [activeEffects],
  );

  useEffect(() => {
    setNow(Date.now());
  }, [effectsSignature]);

  const visibleEffects = useMemo(
    () => activeEffects.filter((effect) => effect.endTime >= now),
    [activeEffects, now],
  );

  useEffect(() => {
    const nextEndTime = visibleEffects
      .map((effect) => effect.endTime)
      .sort((a, b) => a - b)[0];
    if (!nextEndTime) return undefined;
    const delay = Math.max(16, nextEndTime - Date.now() + 16);
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [visibleEffects]);

  return visibleEffects;
}
