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

export function BackgroundEffectsManager({ effects }: Props) {
  const activeEffects = effects.filter((effect) => effect.enabled);

  if (activeEffects.length === 0) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {activeEffects.map((effect) => {
        switch (effect.type) {
          case 'sunrays':
            return (
              <SunraysEffect
                key={effect.id}
                intensity={effect.intensity}
                speed={effect.speed}
                opacity={effect.opacity ?? 1}
                color={effect.color}
              />
            );

          case 'rain':
            return (
              <RainEffect
                key={effect.id}
                intensity={effect.intensity}
                speed={effect.speed}
                opacity={effect.opacity ?? 1}
                color={effect.color}
              />
            );

          case 'snow':
            return (
              <SnowEffect
                key={effect.id}
                intensity={effect.intensity}
                speed={effect.speed}
                opacity={effect.opacity ?? 1}
              />
            );

          case 'fog':
            return (
              <FogEffect
                key={effect.id}
                intensity={effect.intensity}
                speed={effect.speed}
                opacity={effect.opacity ?? 1}
                color={effect.color}
              />
            );

          case 'storm':
            return (
              <StormEffect
                key={effect.id}
                intensity={effect.intensity}
                speed={effect.speed}
                opacity={effect.opacity ?? 1}
                color={effect.color}
              />
            );

          case 'particles':
            return (
              <ParticlesEffect
                key={effect.id}
                intensity={effect.intensity}
                speed={effect.speed}
                opacity={effect.opacity ?? 1}
                color={effect.color}
              />
            );

          case 'sparkles':
            return (
              <SparklesEffect
                key={effect.id}
                intensity={effect.intensity}
                speed={effect.speed}
                opacity={effect.opacity ?? 1}
                color={effect.color}
              />
            );

          default:
            return null;
        }
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
