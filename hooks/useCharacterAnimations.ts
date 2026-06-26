import { useRef, useCallback } from 'react';
import { Animated } from 'react-native';

export interface CharacterAnimationValues {
  opacity: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
  scale: Animated.Value;
}

export interface CharacterInstance {
  id: string;
  characterId: string;
  spriteId: string;
  position: CharacterPosition;
  zIndex: number;
  animatedOpacity: Animated.Value;
  animatedTranslateX: Animated.Value;
  animatedTranslateY: Animated.Value;
  animatedScale: Animated.Value;
}

export type CharacterPosition = 'far-left' | 'left' | 'center' | 'right' | 'far-right';

export function useCharacterAnimations() {
  const cacheRef = useRef<Record<string, CharacterAnimationValues>>({});

  const getAnimValues = useCallback((charId: string): CharacterAnimationValues => {
    if (!cacheRef.current[charId]) {
      cacheRef.current[charId] = {
        opacity: new Animated.Value(1),
        translateX: new Animated.Value(0),
        translateY: new Animated.Value(0),
        scale: new Animated.Value(1),
      };
    }
    return cacheRef.current[charId];
  }, []);

  return { getAnimValues };
}

export function buildCharacterInstance(
  characterId: string,
  spriteId: string,
  zIndex: number,
  position: CharacterPosition,
  animValues: CharacterAnimationValues,
): CharacterInstance {
  return {
    id: characterId,
    characterId,
    spriteId,
    position,
    zIndex,
    animatedOpacity: animValues.opacity,
    animatedTranslateX: animValues.translateX,
    animatedTranslateY: animValues.translateY,
    animatedScale: animValues.scale,
  };
}
