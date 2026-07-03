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

function FogOverlay({ intensity }: { intensity: number }) {
  const opacity = clamp(intensity / 130, 0.18, 0.78);
  const blur = clamp(intensity / 18, 1, 8);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        opacity,
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
        background: 'rgba(235,241,245,0.08)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: '-18%',
          right: '-10%',
          top: '10%',
          height: '26%',
          borderRadius: 999,
          background: 'rgba(245,248,250,0.22)',
          transform: 'rotate(-7deg)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: '-8%',
          right: '-20%',
          top: '38%',
          height: '30%',
          borderRadius: 999,
          background: 'rgba(220,229,235,0.18)',
          transform: 'rotate(5deg)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: '-24%',
          right: '-16%',
          bottom: '4%',
          height: '34%',
          borderRadius: 999,
          background: 'rgba(248,250,252,0.2)',
          transform: 'rotate(-3deg)',
        }}
      />
    </div>
  );
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
      {blur ? <FogOverlay intensity={blur} /> : null}
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
