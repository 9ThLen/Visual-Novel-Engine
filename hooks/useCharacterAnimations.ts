import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { Animated, Easing, useWindowDimensions } from 'react-native';
import type { CharacterEntranceTransition } from '@/lib/character-types';

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

interface AnimatedCharacterState {
  characterId: string;
  visible?: boolean;
  entranceTransition?: CharacterEntranceTransition;
  entranceDelay?: number;
  exitTransition?: CharacterEntranceTransition;
  exitDelay?: number;
}

export function useCharacterAnimations(characters: AnimatedCharacterState[] = []) {
  const cacheRef = useRef<Record<string, CharacterAnimationValues>>({});
  const visibilityRef = useRef<Record<string, boolean>>({});
  const runningRef = useRef<Record<string, Animated.CompositeAnimation>>({});
  const { width: screenWidth } = useWindowDimensions();

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

  useLayoutEffect(() => {
    const currentIds = new Set(characters.map((character) => character.characterId));

    characters.forEach((character) => {
      const nextVisible = character.visible !== false;
      const previousVisible = visibilityRef.current[character.characterId];
      const values = getAnimValues(character.characterId);
      if (previousVisible === nextVisible) return;
      visibilityRef.current[character.characterId] = nextVisible;

      // A hidden character loaded from state starts hidden. Only a transition
      // from visible to hidden should play an exit animation.
      if (previousVisible === undefined && !nextVisible) {
        values.opacity.setValue(0);
        values.translateX.setValue(0);
        values.scale.setValue(1);
        return;
      }

      const transition = nextVisible
        ? character.entranceTransition ?? 'fade'
        : character.exitTransition ?? 'fade';
      const delay = Math.max(
        0,
        (nextVisible ? character.entranceDelay ?? 0 : character.exitDelay ?? 0) * 1000,
      );
      const duration = 480;

      runningRef.current[character.characterId]?.stop();
      if (nextVisible) {
        values.translateX.setValue(
          transition === 'slide-left'
            ? -screenWidth
            : transition === 'slide-right'
              ? screenWidth
              : 0,
        );
        values.opacity.setValue(transition === 'instant' ? 1 : 0);
        values.scale.setValue(transition === 'zoom' ? 0.92 : 1);
      }

      if (transition === 'instant') {
        values.opacity.setValue(nextVisible ? 1 : 0);
        values.translateX.setValue(0);
        values.scale.setValue(1);
        return;
      }

      const animation = Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(values.opacity, {
            toValue: nextVisible ? 1 : 0,
            duration: Math.round(duration * 0.72),
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(values.translateX, {
            toValue: nextVisible
              ? 0
              : transition === 'slide-left'
                ? -screenWidth
                : transition === 'slide-right'
                  ? screenWidth
                  : 0,
            duration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(values.scale, {
            toValue: !nextVisible && transition === 'zoom' ? 0.92 : 1,
            duration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]);
      runningRef.current[character.characterId] = animation;
      animation.start(() => {
        if (runningRef.current[character.characterId] === animation) {
          delete runningRef.current[character.characterId];
        }
      });
    });

    Object.keys(visibilityRef.current).forEach((characterId) => {
      if (currentIds.has(characterId)) return;
      runningRef.current[characterId]?.stop();
      delete runningRef.current[characterId];
      delete visibilityRef.current[characterId];
    });
  }, [characters, getAnimValues, screenWidth]);

  useEffect(() => () => {
    Object.values(runningRef.current).forEach((animation) => animation.stop());
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
