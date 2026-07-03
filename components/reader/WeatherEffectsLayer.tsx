import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions, type DimensionValue } from 'react-native';
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

interface WeatherParticle {
  id: number;
  left: `${number}%`;
  top: `${number}%`;
  drift: number;
  duration: number;
  delay: number;
  size: number;
  opacity: number;
}

function createParticles(effect: ActiveEffect): WeatherParticle[] {
  const intensity = clamp(effect.intensity, 0, 100);
  const isSnow = effect.effectType === 'snow';
  const count = Math.round(isSnow
    ? clamp(effect.snow?.snowflakeCount ?? 24 + intensity * 0.9, 8, 130)
    : clamp(effect.rain?.density ?? 28 + intensity * 1.1, 12, 150));
  const rainSpeed = clamp(effect.rain?.speed ?? 1 + intensity / 45, 0.2, 6);
  const snowSpeed = effect.snow?.speed ?? [1, 3];
  const snowWind = effect.snow?.wind ?? [-0.5, 2];
  return Array.from({ length: count }, (_, index) => {
    const seed = (index * 9301 + 49297) % 233280;
    const unit = seed / 233280;
    const snowSizeMin = effect.snow?.radius?.[0] ?? 2;
    const snowSizeMax = effect.snow?.radius?.[1] ?? 5;
    return {
      id: index,
      left: `${(index * 37) % 100}%`,
      top: `${-18 - ((index * 19) % 82)}%`,
      drift: isSnow
        ? (snowWind[0] + (snowWind[1] - snowWind[0]) * unit) * 34
        : clamp(effect.rain?.wind ?? 0, -80, 80),
      duration: isSnow
        ? 4200 / clamp(snowSpeed[0] + (snowSpeed[1] - snowSpeed[0]) * unit, 0.2, 8)
        : 1200 / rainSpeed,
      delay: (index * 97) % 1800,
      size: isSnow ? snowSizeMin + (snowSizeMax - snowSizeMin) * unit : 1,
      opacity: isSnow ? 0.45 + unit * 0.45 : 1,
    };
  });
}

function LightningLayer() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(3200),
        Animated.timing(opacity, { toValue: 0.62, duration: 42, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 90, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(80),
        Animated.timing(opacity, { toValue: 0.28, duration: 36, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 150, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: '#f3f8ff', opacity },
      ]}
    />
  );
}

export function WeatherEffectsLayer({ effects, target = 'screen' }: WeatherEffectsLayerProps) {
  const { height } = useWindowDimensions();
  const rain = strongestEffect(effects, 'rain', target);
  const snow = strongestEffect(effects, 'snow', target);
  const active = rain ?? snow;

  const particles = useMemo(() => active ? createParticles(active) : [], [active]);
  const progressValues = useMemo(
    () => particles.map(() => new Animated.Value(0)),
    [particles],
  );

  useEffect(() => {
    if (!active || particles.length === 0) return undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const animations: Animated.CompositeAnimation[] = [];
    progressValues.forEach((progress, index) => {
      const particle = particles[index];
      progress.setValue(0);
      const animation = Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: particle.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        { resetBeforeIteration: true },
      );
      animations.push(animation);
      timers.push(setTimeout(() => animation.start(), particle.delay));
    });
    return () => {
      timers.forEach(clearTimeout);
      animations.forEach((animation) => animation.stop());
    };
  }, [active, particles, progressValues]);

  if (!active) return null;

  const isSnow = active.effectType === 'snow';
  const color = isSnow ? active.snow?.color ?? '#ffffff' : active.rain?.color ?? '#d2e8ff';
  const opacity = isSnow
    ? clamp(active.snow?.opacity?.[1] ?? 0.35 + active.intensity / 180, 0, 1)
    : clamp(active.rain?.opacity ?? 0.18 + active.intensity / 220, 0, 1);
  const dropWidth = isSnow ? 5 : clamp(active.rain?.dropWidth ?? 2, 1, 6);
  const dropHeight = isSnow ? 5 : clamp(active.rain?.dropLength ?? 18 + active.intensity * 0.25, 6, 70);
  const angle = isSnow ? 0 : active.rain?.angle ?? -12;

  const lightning = !isSnow && Boolean(active.rain?.lightning);

  return (
    <View
      testID="weather-effects-layer"
      style={[
        StyleSheet.absoluteFillObject,
        getPointerEventsStyle('none'),
        { opacity, zIndex: 30, elevation: 30 },
      ]}
    >
      {particles.map((particle, index) => {
        const progress = progressValues[index];
        const translateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-80, height + 120],
        });
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, particle.drift],
        });
        return (
        <Animated.View
          key={particle.id}
          style={{
            position: 'absolute',
            left: particle.left as DimensionValue,
            top: particle.top as DimensionValue,
            width: isSnow ? particle.size : dropWidth,
            height: isSnow ? particle.size : dropHeight,
            borderRadius: isSnow ? particle.size : Math.max(1, dropWidth / 2),
            backgroundColor: color,
            opacity: particle.opacity,
            transform: [
              { translateX },
              { translateY },
              { rotate: `${angle}deg` },
            ],
          }}
        />
        );
      })}
      {lightning ? <LightningLayer /> : null}
    </View>
  );
}
