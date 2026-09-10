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

function strongestEffect(
  effects: ActiveEffect[],
  effectType: ActiveEffect['effectType'],
): ActiveEffect | null {
  return effects
    .filter((effect) => effect.effectType === effectType)
    .sort((a, b) => b.intensity - a.intensity)[0] ?? null;
}

function effectDurationSeconds(effect: ActiveEffect): number {
  if (effect.sceneBound) return 999999;
  return Math.max(0.1, (effect.endTime - effect.startTime) / 1000);
}

function BlurOverlay({ effect }: { effect: ActiveEffect }) {
  const blurPx = clamp(effect.intensity / 6, 2, 20);
  const fadeIn = Math.max(0, effect.fadeIn ?? 0);
  return (
    <div
      data-testid="fx-blur"
      style={{
        position: 'absolute',
        inset: 0,
        backdropFilter: `blur(${blurPx}px)`,
        WebkitBackdropFilter: `blur(${blurPx}px)`,
        ...(fadeIn ? { animation: `vne-fx-fade-in ${fadeIn}s ease-out` } : {}),
      }}
    />
  );
}

function FlashOverlay({ effect, color }: { effect: ActiveEffect; color: string }) {
  const peak = clamp(effect.intensity / 120, 0.2, 0.85);
  const duration = effectDurationSeconds(effect);
  return (
    <div data-testid="fx-flash" style={{ position: 'absolute', inset: 0, opacity: peak }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: color,
          opacity: 0,
          animation: `vne-fx-flash ${duration}s ease-out forwards`,
        }}
      />
    </div>
  );
}

function VignetteOverlay({ effect }: { effect: ActiveEffect }) {
  const spread = clamp(80 + effect.intensity, 90, 220);
  const alpha = clamp(effect.intensity / 180, 0.18, 0.78);
  return (
    <div
      data-testid="fx-vignette"
      style={{
        position: 'absolute',
        inset: 0,
        boxShadow: `inset 0 0 ${spread}px rgba(0,0,0,${alpha})`,
      }}
    />
  );
}

function GlitchOverlay({ effect }: { effect: ActiveEffect }) {
  const intensity = clamp(effect.intensity, 0, 100);
  const shift = clamp(intensity / 5, 4, 20);
  const bandHeight = clamp(4 + intensity / 8, 4, 17);
  const fringeOpacity = clamp(intensity / 320, 0.06, 0.3);
  const bands = [
    { top: 14, duration: 0.34, hue: 120 },
    { top: 47, duration: 0.46, hue: -140 },
    { top: 74, duration: 0.23, hue: 200 },
  ];
  return (
    <div data-testid="fx-glitch" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {bands.map((band, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: '-4%',
            right: '-4%',
            top: `${band.top}%`,
            height: `${bandHeight}%`,
            backdropFilter: `hue-rotate(${band.hue}deg) saturate(1.8) contrast(1.25)`,
            WebkitBackdropFilter: `hue-rotate(${band.hue}deg) saturate(1.8) contrast(1.25)`,
            animation: `vne-fx-glitch-shift-${index % 3} ${band.duration}s steps(1, end) infinite`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(255,0,64,0.5)',
          mixBlendMode: 'screen',
          opacity: fringeOpacity,
          animation: `vne-fx-glitch-shift-1 0.5s steps(1, end) infinite`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,224,255,0.5)',
          mixBlendMode: 'screen',
          opacity: fringeOpacity,
          animation: `vne-fx-glitch-shift-2 0.42s steps(1, end) infinite reverse`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px)',
          opacity: clamp(intensity / 260, 0.08, 0.36),
        }}
      />
      <style>
        {`
        @keyframes vne-fx-glitch-shift-0 {
          0%, 100% { transform: translateX(0); opacity: 0.9; }
          12% { transform: translateX(-${shift}px); }
          24% { transform: translateX(${shift * 0.6}px); opacity: 0.4; }
          43% { transform: translateX(0); opacity: 1; }
          61% { transform: translateX(${shift}px); }
          78% { transform: translateX(-${shift * 0.4}px); opacity: 0.55; }
        }
        @keyframes vne-fx-glitch-shift-1 {
          0%, 100% { transform: translateX(0); }
          17% { transform: translateX(${shift * 0.5}px); }
          36% { transform: translateX(-${shift * 0.8}px); }
          58% { transform: translateX(${shift * 0.3}px); }
          81% { transform: translateX(-${shift * 0.5}px); }
        }
        @keyframes vne-fx-glitch-shift-2 {
          0%, 100% { transform: translateX(0); }
          21% { transform: translateX(-${shift * 0.35}px); }
          47% { transform: translateX(${shift * 0.7}px); }
          69% { transform: translateX(-${shift}px); }
          88% { transform: translateX(${shift * 0.25}px); }
        }
        `}
      </style>
    </div>
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
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>
        {`
        @keyframes vne-fx-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes vne-fx-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        `}
      </style>
      {blur ? <BlurOverlay key={`blur-${blur.startTime}`} effect={blur} /> : null}
      {flash ? <FlashOverlay key={`flash-${flash.startTime}`} effect={flash} color={colors.surface} /> : null}
      {vignette ? <VignetteOverlay effect={vignette} /> : null}
      {glitch ? <GlitchOverlay key={`glitch-${glitch.startTime}`} effect={glitch} /> : null}
    </div>
  );
}
