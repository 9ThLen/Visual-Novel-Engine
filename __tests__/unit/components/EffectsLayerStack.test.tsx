import React from 'react';
import { render } from '@testing-library/react';
import { EffectsLayerStack, effectsForCharacter, effectsForTarget } from '@/components/reader/EffectsLayerStack';
import type { ActiveEffect } from '@/lib/engine/runtime-types';
import { mockColors } from './reader-test-utils';

const now = Date.now();

function effect(overrides: Partial<ActiveEffect>): ActiveEffect {
  return {
    effectType: 'rain',
    target: 'screen',
    intensity: 60,
    startTime: now,
    endTime: now + 1000,
    ...overrides,
  };
}

describe('EffectsLayerStack', () => {
  it('filters effects by target and character id', () => {
    const effects = [
      effect({ target: 'screen' }),
      effect({ target: 'background', effectType: 'blur' }),
      effect({ target: 'character', characterId: 'hero', effectType: 'flash' }),
    ];

    expect(effectsForTarget(effects, 'screen')).toHaveLength(1);
    expect(effectsForTarget(effects, 'background')).toHaveLength(1);
    expect(effectsForCharacter(effects, 'hero')).toHaveLength(1);
    expect(effectsForCharacter(effects, 'villain')).toHaveLength(0);
  });

  it('renders only matching target layers', () => {
    const screenRain = effect({
      target: 'screen',
      rain: { density: 12, lightning: true },
    });
    const backgroundFog = effect({
      target: 'background',
      effectType: 'blur',
      intensity: 80,
    });

    const screen = render(
      <EffectsLayerStack
        effects={[screenRain, backgroundFog]}
        colors={mockColors}
        target="screen"
      />,
    );
    expect(screen.container.childElementCount).toBeGreaterThan(0);

    const character = render(
      <EffectsLayerStack
        effects={[screenRain, backgroundFog]}
        colors={mockColors}
        target="character"
      />,
    );
    expect(character.container.childElementCount).toBe(0);
  });
});
