import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { ActiveEffect } from '@/lib/engine/runtime-types';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';
import { withAlpha } from '@/lib/_core/theme';

interface VisualEffectsOverlayProps {
  effects: ActiveEffect[];
  colors: {
    surface: string;
    foreground: string;
    primary: string;
  };
  target?: ActiveEffect['target'];
}

const GLITCH_TICK_MS = 90;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function strongestEffect(
  effects: ActiveEffect[],
  effectType: ActiveEffect['effectType'],
): ActiveEffect | null {
  return effects
    .filter((effect) => effect.effectType === effectType)
    .sort((a, b) => b.intensity - a.intensity)[0] ?? null;
}

function BlurOverlay({ effect }: { effect: ActiveEffect }) {
  const intensity = clamp(effect.intensity, 8, 100);
  return (
    <BlurView
      intensity={intensity}
      experimentalBlurMethod="dimezisBlurView"
      style={StyleSheet.absoluteFillObject}
    />
  );
}

function FlashOverlay({ effect, color }: { effect: ActiveEffect; color: string }) {
  const opacity = useRef(new Animated.Value(clamp(effect.intensity / 120, 0.2, 0.85))).current;

  useEffect(() => {
    const duration = effect.sceneBound ? 999999000 : Math.max(100, effect.endTime - effect.startTime);
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [effect.startTime, effect.endTime, effect.sceneBound, opacity]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { backgroundColor: color, opacity }]}
    />
  );
}

function GlitchOverlay({ effect, tint }: { effect: ActiveEffect; tint: string }) {
  const intensity = clamp(effect.intensity, 0, 100);
  const shift = clamp(intensity / 5, 4, 20);
  const bandHeight = clamp(4 + intensity / 8, 4, 17);
  const fringeOpacity = clamp(intensity / 320, 0.06, 0.3);
  const offsets = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const flicker = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      offsets.forEach((offset) => {
        Animated.timing(offset, {
          toValue: (Math.random() * 2 - 1) * shift,
          duration: 60,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
      });
      flicker.setValue(Math.random() < 0.18 ? 0.35 : 1);
    }, GLITCH_TICK_MS);
    return () => clearInterval(interval);
  }, [offsets, flicker, shift]);

  const bands = [
    { top: '14%' as const, color: withAlpha(tint, 0.5) },
    { top: '47%' as const, color: 'rgba(255,0,64,0.4)' },
    { top: '74%' as const, color: 'rgba(0,224,255,0.4)' },
  ];

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: flicker }]}>
      {bands.map((band, index) => (
        <Animated.View
          key={index}
          style={{
            position: 'absolute',
            left: '-4%',
            right: '-4%',
            top: band.top,
            height: `${bandHeight}%`,
            backgroundColor: band.color,
            opacity: fringeOpacity * 2.2,
            transform: [{ translateX: offsets[index] }],
          }}
        />
      ))}
    </Animated.View>
  );
}

export function VisualEffectsOverlay({ effects, colors, target = 'screen' }: VisualEffectsOverlayProps) {
  const targetEffects = effects.filter((effect) => (effect.target ?? 'screen') === target);
  if (!targetEffects.length) return null;

  const flash = strongestEffect(targetEffects, 'flash');
  const vignette = strongestEffect(targetEffects, 'vignette');
  const glitch = strongestEffect(targetEffects, 'glitch');
  const blur = strongestEffect(targetEffects, 'blur');

  if (!flash && !vignette && !glitch && !blur) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, getPointerEventsStyle('none')]}>
      {blur ? <BlurOverlay key={`blur-${blur.startTime}`} effect={blur} /> : null}
      {flash ? <FlashOverlay key={`flash-${flash.startTime}`} effect={flash} color={colors.surface} /> : null}
      {vignette ? (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { borderWidth: 36, borderColor: withAlpha(colors.foreground, clamp(vignette.intensity / 220, 0.16, 0.7)) },
          ]}
        />
      ) : null}
      {glitch ? <GlitchOverlay key={`glitch-${glitch.startTime}`} effect={glitch} tint={colors.primary} /> : null}
    </View>
  );
}
