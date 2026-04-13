/**
 * Character Animation Manager
 * Manages character animations and screen effects
 */

import { Animated, Easing } from 'react-native';
import type {
  CharacterInstance,
  CharacterAction,
  CharacterPosition,
  CharacterTransition,
} from './character-types';

export interface AnimatedCharacterInstance extends CharacterInstance {
  animatedOpacity: Animated.Value;
  animatedTranslateX: Animated.Value;
  animatedTranslateY: Animated.Value;
  animatedScale: Animated.Value;
}

// ── Position Mapping ──────────────────────────────────────────────────────

export function getPositionOffset(position: CharacterPosition): number {
  switch (position) {
    case 'far-left':
      return -0.35; // 35% from left edge
    case 'left':
      return -0.2; // 20% from left edge
    case 'center':
      return 0;
    case 'right':
      return 0.2; // 20% from right edge
    case 'far-right':
      return 0.35; // 35% from right edge
    default:
      return 0;
  }
}

// ── Animation Factory ─────────────────────────────────────────────────────

export function createCharacterAnimation(
  instance: AnimatedCharacterInstance,
  action: CharacterAction,
  screenWidth: number
): Animated.CompositeAnimation | null {
  const transition = action.animation?.transition || 'fade';
  const duration = action.animation?.duration || 300;
  const delay = action.animation?.delay || 0;

  const targetOpacity = action.opacity ?? instance.opacity ?? 1;
  const targetScale = action.scale ?? instance.scale ?? 1;
  const targetPosition = action.position || instance.position;
  const targetX = getPositionOffset(targetPosition) * screenWidth;

  switch (transition) {
    case 'instant':
      // No animation, just set values
      instance.animatedOpacity.setValue(targetOpacity);
      instance.animatedTranslateX.setValue(targetX);
      instance.animatedScale.setValue(targetScale);
      return null;

    case 'fade':
      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(instance.animatedOpacity, {
            toValue: targetOpacity,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(instance.animatedTranslateX, {
            toValue: targetX,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]);

    case 'slide':
      // Start from off-screen
      const startX =
        action.type === 'show'
          ? targetX + (targetX < 0 ? -screenWidth : screenWidth)
          : instance.animatedTranslateX;

      if (action.type === 'show') {
        instance.animatedTranslateX.setValue(startX as number);
        instance.animatedOpacity.setValue(0);
      }

      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(instance.animatedTranslateX, {
            toValue: targetX,
            duration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(instance.animatedOpacity, {
            toValue: targetOpacity,
            duration: duration * 0.6,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]);

    case 'zoom':
      // Start small and zoom in
      if (action.type === 'show') {
        instance.animatedScale.setValue(0.5);
        instance.animatedOpacity.setValue(0);
      }

      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.spring(instance.animatedScale, {
            toValue: targetScale,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(instance.animatedOpacity, {
            toValue: targetOpacity,
            duration: duration * 0.7,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(instance.animatedTranslateX, {
            toValue: targetX,
            duration,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]);

    case 'shake':
      // Shake animation (for emphasis)
      return Animated.sequence([
        Animated.delay(delay),
        Animated.sequence([
          Animated.timing(instance.animatedTranslateX, {
            toValue: targetX - 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(instance.animatedTranslateX, {
            toValue: targetX + 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(instance.animatedTranslateX, {
            toValue: targetX - 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(instance.animatedTranslateX, {
            toValue: targetX + 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(instance.animatedTranslateX, {
            toValue: targetX,
            duration: 50,
            useNativeDriver: true,
          }),
        ]),
      ]);

    default:
      return null;
  }
}

// ── Screen Shake Effect ───────────────────────────────────────────────────

export function createScreenShakeAnimation(
  shakeValue: Animated.Value,
  intensity: number = 10,
  duration: number = 300
): Animated.CompositeAnimation {
  return Animated.sequence([
    Animated.timing(shakeValue, {
      toValue: intensity,
      duration: duration / 6,
      useNativeDriver: true,
    }),
    Animated.timing(shakeValue, {
      toValue: -intensity,
      duration: duration / 6,
      useNativeDriver: true,
    }),
    Animated.timing(shakeValue, {
      toValue: intensity * 0.7,
      duration: duration / 6,
      useNativeDriver: true,
    }),
    Animated.timing(shakeValue, {
      toValue: -intensity * 0.7,
      duration: duration / 6,
      useNativeDriver: true,
    }),
    Animated.timing(shakeValue, {
      toValue: intensity * 0.3,
      duration: duration / 6,
      useNativeDriver: true,
    }),
    Animated.timing(shakeValue, {
      toValue: 0,
      duration: duration / 6,
      useNativeDriver: true,
    }),
  ]);
}

// ── Hide Animation ────────────────────────────────────────────────────────

export function createHideAnimation(
  instance: AnimatedCharacterInstance,
  transition: CharacterTransition = 'fade',
  duration: number = 300
): Animated.CompositeAnimation {
  switch (transition) {
    case 'instant':
      instance.animatedOpacity.setValue(0);
      return Animated.timing(instance.animatedOpacity, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      });

    case 'slide':
      const currentX = (instance.animatedTranslateX as any)._value || 0;
      const exitX = currentX + (currentX < 0 ? -500 : 500);
      return Animated.parallel([
        Animated.timing(instance.animatedTranslateX, {
          toValue: exitX,
          duration,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(instance.animatedOpacity, {
          toValue: 0,
          duration: duration * 0.8,
          useNativeDriver: true,
        }),
      ]);

    case 'zoom':
      return Animated.parallel([
        Animated.timing(instance.animatedScale, {
          toValue: 0.5,
          duration,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(instance.animatedOpacity, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ]);

    case 'fade':
    default:
      return Animated.timing(instance.animatedOpacity, {
        toValue: 0,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
  }
}

// ── Initialize Animated Instance ──────────────────────────────────────────

export function createAnimatedInstance(
  instance: CharacterInstance,
  screenWidth: number
): AnimatedCharacterInstance {
  const positionX = getPositionOffset(instance.position) * screenWidth;

  return {
    ...instance,
    animatedOpacity: new Animated.Value(instance.opacity ?? 1),
    animatedTranslateX: new Animated.Value(positionX),
    animatedTranslateY: new Animated.Value(0),
    animatedScale: new Animated.Value(instance.scale ?? 1),
  };
}
