import React from 'react';
import { render, screen } from '@testing-library/react';
import { WeatherEffectsLayer } from '@/components/reader/WeatherEffectsLayer.web';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

function snowEffect(overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  const now = Date.now();
  return {
    effectType: 'snow',
    target: 'screen',
    intensity: 70,
    startTime: now,
    endTime: now + 8000,
    snow: {
      snowflakeCount: 12,
      color: '#ffffff',
    },
    ...overrides,
  };
}

describe('WeatherEffectsLayer.web', () => {
  it('renders snow through react-snowfall', async () => {
    render(<WeatherEffectsLayer effects={[snowEffect()]} target="screen" />);

    expect(screen.getByTestId('weather-effects-layer')).toBeTruthy();
    expect(await screen.findByTestId('react-snowfall-effect')).toBeTruthy();
    expect(await screen.findByTestId('SnowfallCanvas')).toBeTruthy();
  });

  it('renders rain through the react-weather-effects adapter', async () => {
    render(<WeatherEffectsLayer effects={[snowEffect({
      effectType: 'rain',
      snow: undefined,
      rain: { variant: 'fallout', lightning: true },
    })]} target="screen" />);

    expect(screen.getByTestId('weather-effects-layer')).toBeTruthy();
    expect((await screen.findByTestId('react-weather-rain-effect')).getAttribute('data-rain-variant')).toBe('fallout');
    expect(await screen.findByTestId('react-weather-rain-lightning')).toBeTruthy();
  });

  it('renders fog variants through the react-weather-effects adapter', async () => {
    render(<WeatherEffectsLayer effects={[snowEffect({
      effectType: 'fog',
      snow: undefined,
      fog: { variant: 'dense' },
    })]} target="screen" />);

    expect(screen.getByTestId('weather-effects-layer')).toBeTruthy();
    expect((await screen.findByTestId('react-weather-fog-effect')).getAttribute('data-fog-variant')).toBe('dense');
  });
});
