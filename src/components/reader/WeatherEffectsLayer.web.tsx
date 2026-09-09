import React, { Suspense, lazy } from 'react';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

const ReactSnowfallEffect = lazy(() =>
  import('@/components/reader/weather-renderers/ReactSnowfallEffect').then((module) => ({ default: module.ReactSnowfallEffect })),
);
const ReactWeatherFogEffect = lazy(() =>
  import('@/components/reader/weather-renderers/ReactWeatherFogEffect').then((module) => ({ default: module.ReactWeatherFogEffect })),
);
const ReactWeatherRainEffect = lazy(() =>
  import('@/components/reader/weather-renderers/ReactWeatherRainEffect').then((module) => ({ default: module.ReactWeatherRainEffect })),
);

interface WeatherEffectsLayerProps {
  effects: ActiveEffect[];
  target?: ActiveEffect['target'];
}

function strongestEffect(
  effects: ActiveEffect[],
  type: 'rain' | 'snow' | 'fog',
  target: ActiveEffect['target'],
): ActiveEffect | null {
  return effects
    .filter((effect) => effect.effectType === type && (effect.target ?? 'screen') === target)
    .sort((a, b) => b.intensity - a.intensity)[0] ?? null;
}

export function WeatherEffectsLayer({ effects, target = 'screen' }: WeatherEffectsLayerProps) {
  const rain = strongestEffect(effects, 'rain', target);
  const snow = strongestEffect(effects, 'snow', target);
  const fog = strongestEffect(effects, 'fog', target);

  if (!rain && !snow && !fog) return null;

  return (
    <div
      data-testid="weather-effects-layer"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      <Suspense fallback={null}>
        {fog ? <ReactWeatherFogEffect effect={fog} /> : null}
        {rain ? <ReactWeatherRainEffect effect={rain} /> : null}
        {snow ? <ReactSnowfallEffect effect={snow} /> : null}
      </Suspense>
    </div>
  );
}
