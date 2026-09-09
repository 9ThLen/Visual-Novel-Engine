import React from 'react';
import type { useColors } from '@/hooks/use-colors';
import type { ActiveEffect } from '@/lib/engine/runtime-types';
import { VisualEffectsOverlay } from '@/components/reader/VisualEffectsOverlay';
import { WeatherEffectsLayer } from '@/components/reader/WeatherEffectsLayer';

export function effectsForTarget(effects: ActiveEffect[], target: ActiveEffect['target']): ActiveEffect[] {
  return effects.filter((effect) => (effect.target ?? 'screen') === target);
}

export function effectsForCharacter(effects: ActiveEffect[], characterId: string): ActiveEffect[] {
  return effects.filter((effect) => effect.characterId === characterId);
}

export function EffectsLayerStack({
  effects,
  colors,
  target,
}: {
  effects: ActiveEffect[];
  colors: ReturnType<typeof useColors>;
  target: ActiveEffect['target'];
}) {
  const targetEffects = effectsForTarget(effects, target);
  if (!targetEffects.length) return null;

  return (
    <>
      <VisualEffectsOverlay effects={targetEffects} colors={colors} target={target} />
      <WeatherEffectsLayer effects={targetEffects} target={target} />
    </>
  );
}
