import React, { useMemo } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import type { ActiveEffect } from '@/lib/engine/runtime-types';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';

interface WeatherEffectsLayerProps {
  effects: ActiveEffect[];
  target?: ActiveEffect['target'];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function strongestEffect(effects: ActiveEffect[], type: 'rain' | 'snow', target: ActiveEffect['target']): ActiveEffect | null {
  return effects
    .filter((effect) => effect.effectType === type && (effect.target ?? 'screen') === target)
    .sort((a, b) => b.intensity - a.intensity)[0] ?? null;
}

export function WeatherEffectsLayer({ effects, target = 'screen' }: WeatherEffectsLayerProps) {
  const rain = strongestEffect(effects, 'rain', target);
  const snow = strongestEffect(effects, 'snow', target);
  const active = rain ?? snow;

  const particles = useMemo(() => {
    if (!active) return [];
    const intensity = clamp(active.intensity, 0, 100);
    const count = Math.round(active.effectType === 'snow' ? 24 + intensity * 0.9 : 28 + intensity * 1.1);
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      left: `${(index * 17) % 100}%`,
      top: `${(index * 29) % 100}%`,
    }));
  }, [active]);

  if (!active) return null;

  const isSnow = active.effectType === 'snow';
  const color = isSnow ? active.snow?.color ?? '#ffffff' : active.rain?.color ?? '#d2e8ff';
  const opacity = isSnow
    ? clamp(active.snow?.opacity?.[1] ?? 0.35 + active.intensity / 180, 0, 1)
    : clamp(active.rain?.opacity ?? 0.18 + active.intensity / 220, 0, 1);
  const dropWidth = isSnow ? 5 : clamp(active.rain?.dropWidth ?? 2, 1, 6);
  const dropHeight = isSnow ? 5 : clamp(active.rain?.dropLength ?? 18 + active.intensity * 0.25, 6, 70);

  const lightning = !isSnow && Boolean(active.rain?.lightning);

  return (
    <View style={[StyleSheet.absoluteFillObject, getPointerEventsStyle('none'), { opacity }]}>
      {lightning ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#e6f2ff', opacity: 0.18 }]} /> : null}
      {particles.map((particle) => (
        <View
          key={particle.id}
          style={{
            position: 'absolute',
            left: particle.left as DimensionValue,
            top: particle.top as DimensionValue,
            width: dropWidth,
            height: dropHeight,
            borderRadius: isSnow ? dropWidth : Math.max(1, dropWidth / 2),
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
