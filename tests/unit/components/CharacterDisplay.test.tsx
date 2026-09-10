import React from 'react';
import { render, screen } from '@testing-library/react';
import { Animated } from 'react-native';
import { CharacterDisplay } from '@/components/CharacterDisplay';
import { CHARACTER_STAGE_HEIGHT_FRACTION, DEFAULT_CHARACTER_ASPECT_RATIO } from '@/lib/character-layout';
import type { AnimatedCharacterInstance } from '@/lib/character-animator';

function instance(): AnimatedCharacterInstance {
  return {
    id: 'instance-1',
    characterId: 'alice',
    spriteId: 'neutral',
    position: 'center',
    animatedOpacity: new Animated.Value(1),
    animatedTranslateX: new Animated.Value(0),
    animatedTranslateY: new Animated.Value(0),
    animatedScale: new Animated.Value(1),
  } as AnimatedCharacterInstance;
}

describe('CharacterDisplay', () => {
  it('sizes the sprite by the stage height it was given', () => {
    render(
      <CharacterDisplay
        instance={instance()}
        spriteUri="file://alice.png"
        stageWidth={1920}
        stageHeight={800}
      />,
    );

    const container = screen.getByLabelText('Character sprite');

    expect(container.style.height).toBe(`${800 * CHARACTER_STAGE_HEIGHT_FRACTION}px`);
    expect(container.style.width)
      .toBe(`${800 * CHARACTER_STAGE_HEIGHT_FRACTION * DEFAULT_CHARACTER_ASPECT_RATIO}px`);
  });

  it('keeps a wide sprite inside a narrow stage', () => {
    render(
      <CharacterDisplay
        instance={instance()}
        spriteUri="file://alice.png"
        stageWidth={390}
        stageHeight={2000}
      />,
    );

    const container = screen.getByLabelText('Character sprite');

    expect(Number.parseFloat(container.style.width)).toBeLessThanOrEqual(390);
  });
});
