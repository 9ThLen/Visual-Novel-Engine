/**
 * Background Effects Manager Component
 * Renders all active background effects
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { BackgroundEffect } from '@/lib/background-effects-types';
import { SunraysEffect } from './SunraysEffect';
import { RainEffect } from './RainEffect';
import { SnowEffect } from './SnowEffect';
import { FogEffect } from './FogEffect';
import { StormEffect } from './StormEffect';
import { ParticlesEffect } from './ParticlesEffect';
import { SparklesEffect } from './SparklesEffect';

interface Props {
  effects: BackgroundEffect[];
}

const EFFECT_COMPONENTS: Record<string, React.ComponentType<any>> = {
  sunrays: SunraysEffect,
  rain: RainEffect,
  snow: SnowEffect,
  fog: FogEffect,
  storm: StormEffect,
  particles: ParticlesEffect,
  sparkles: SparklesEffect,
};

export function BackgroundEffectsManager({ effects }: Props) {
  const activeEffects = effects.filter((effect) => effect.enabled);

  if (activeEffects.length === 0) {
    return null;
  }

  // Scaling factor to prevent excessive view counts and overdraw when multiple effects are active.
  // Each additional effect reduces the intensity of all effects to maintain a stable budget.
  const scaleFactor = activeEffects.length > 1 
    ? 1 / (1 + (activeEffects.length - 1) * 0.5) 
    : 1;

  return (
    <View style={styles.container} pointerEvents="none">
      {activeEffects.map((effect) => {
        const EffectComponent = EFFECT_COMPONENTS[effect.type];
        if (!EffectComponent) return null;

        return (
          <EffectComponent
            key={effect.id}
            intensity={effect.intensity * scaleFactor}
            speed={effect.speed}
            opacity={(effect.opacity ?? 1) * (activeEffects.length > 2 ? 0.8 : 1)}
            color={effect.color}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
