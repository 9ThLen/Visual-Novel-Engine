import React from 'react';
import { StyleSheet, View } from 'react-native';
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function strongestIntensity(effects: ActiveEffect[], effectType: ActiveEffect['effectType']): number {
  return effects
    .filter((effect) => effect.effectType === effectType)
    .reduce((max, effect) => Math.max(max, effect.intensity), 0);
}

export function VisualEffectsOverlay({ effects, colors, target = 'screen' }: VisualEffectsOverlayProps) {
  const targetEffects = effects.filter((effect) => (effect.target ?? 'screen') === target);
  if (!targetEffects.length) return null;

  const flash = strongestIntensity(targetEffects, 'flash');
  const vignette = strongestIntensity(targetEffects, 'vignette');
  const glitch = strongestIntensity(targetEffects, 'glitch');
  const blur = strongestIntensity(targetEffects, 'blur');

  if (!flash && !vignette && !glitch && !blur) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, getPointerEventsStyle('none')]}>
      {blur ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.surface, opacity: clamp(blur / 900, 0.03, 0.12) }]} /> : null}
      {flash ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.surface, opacity: clamp(flash / 180, 0.12, 0.7) }]} /> : null}
      {vignette ? (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { borderWidth: 36, borderColor: withAlpha(colors.foreground, clamp(vignette / 220, 0.16, 0.7)) },
          ]}
        />
      ) : null}
      {glitch ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.primary, opacity: clamp(glitch / 700, 0.04, 0.22) }]} /> : null}
    </View>
  );
}
