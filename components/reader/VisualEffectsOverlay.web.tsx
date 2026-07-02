import React from 'react';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

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
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {blur ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: `blur(${clamp(blur / 18, 1, 8)}px)`,
            WebkitBackdropFilter: `blur(${clamp(blur / 18, 1, 8)}px)`,
            background: `rgba(255,255,255,${clamp(blur / 900, 0.03, 0.12)})`,
          }}
        />
      ) : null}
      {flash ? <div style={{ position: 'absolute', inset: 0, background: colors.surface, opacity: clamp(flash / 180, 0.12, 0.7) }} /> : null}
      {vignette ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: `inset 0 0 ${clamp(80 + vignette, 90, 220)}px rgba(0,0,0,${clamp(vignette / 180, 0.18, 0.78)})`,
          }}
        />
      ) : null}
      {glitch ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`,
            mixBlendMode: 'screen',
            opacity: clamp(glitch / 650, 0.04, 0.22),
            transform: `translateX(${Math.round(glitch / 18)}px)`,
          }}
        />
      ) : null}
    </div>
  );
}
