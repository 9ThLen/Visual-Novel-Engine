import React, { useMemo } from 'react';
import { Snowfall } from 'react-snowfall';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function validRange(range: [number, number] | undefined, fallback: [number, number], min: number, max: number): [number, number] {
  if (!range || range.length !== 2) return fallback;
  const from = clamp(range[0], min, max);
  const to = clamp(range[1], min, max);
  return from <= to ? [from, to] : [to, from];
}

export function ReactSnowfallEffect({ effect }: { effect: ActiveEffect }) {
  const snow = effect.snow ?? {};
  const intensity = clamp(effect.intensity, 0, 100);
  const snowflakeCount = Math.round(clamp(snow.snowflakeCount ?? 80 + intensity * 1.4, 16, 360));

  const style = useMemo<React.CSSProperties>(() => ({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  }), []);

  return (
    <div data-testid="react-snowfall-effect" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <Snowfall
        changeFrequency={Math.round(clamp(snow.changeFrequency ?? 180, 20, 600))}
        color={snow.color ?? '#ffffff'}
        enable3DRotation={snow.enable3DRotation ?? true}
        opacity={validRange(snow.opacity, [0.55, 0.95], 0.05, 1)}
        radius={validRange(snow.radius, [1.2, 4.2], 0.5, 18)}
        rotationSpeed={validRange(snow.rotationSpeed, [-1, 1], -8, 8)}
        snowflakeCount={snowflakeCount}
        speed={validRange(snow.speed, [0.8, 2.4], 0.1, 10)}
        style={style}
        wind={validRange(snow.wind, [-0.5, 2], -12, 12)}
      />
    </div>
  );
}
