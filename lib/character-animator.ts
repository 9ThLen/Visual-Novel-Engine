import { Animated, Easing } from 'react-native';
import type {
  CharacterInstance,
  CharacterAction,
  CharacterPosition,
  CharacterTransition,
} from './character-types';

export type AnimatedCharacterInstance = CharacterInstance & {
  animatedOpacity: Animated.Value;
  animatedTranslateX: Animated.Value;
  animatedTranslateY: Animated.Value;
  animatedScale: Animated.Value;
};

const OPACITY_SLIDE_SHOW_RATIO = 0.6;
const OPACITY_ZOOM_SHOW_RATIO = 0.7;
const OPACITY_SLIDE_HIDE_RATIO = 0.8;
const ZOOM_INITIAL_SCALE = 0.5;
const ZOOM_EXIT_SCALE = 0.5;
const SHAKE_AMPLITUDE = 10;
const SHAKE_STEP_DURATION = 50;
const SHAKE_DECAY_FACTORS = [1, 1, 0.7, 0.7, 0.3];
const SHAKE_STEP_COUNT = 6;

export function getPositionOffset(position: CharacterPosition): number {
  switch (position) {
    case 'far-left':
      return -0.35;
    case 'left':
      return -0.2;
    case 'center':
      return 0;
    case 'right':
      return 0.2;
    case 'far-right':
      return 0.35;
    default:
      return 0;
  }
}

function createShakeSequence(
  value: Animated.Value,
  targets: number[],
  stepDuration: number,
): Animated.CompositeAnimation {
  return Animated.sequence(
    targets.map((target) =>
      Animated.timing(value, { toValue: target, duration: stepDuration, useNativeDriver: true }),
    ),
  );
}

export function createCharacterAnimation(
  instance: AnimatedCharacterInstance,
  action: CharacterAction,
  screenWidth: number,
): Animated.CompositeAnimation | null {
  const transition = action.animation?.transition || 'fade';
  const duration = action.animation?.duration ?? 300;
  const delay = action.animation?.delay ?? 0;

  const targetOpacity = action.opacity ?? instance.opacity ?? 1;
  const targetScale = action.scale ?? instance.scale ?? 1;
  const targetPosition = action.position || instance.position;
  const targetX = getPositionOffset(targetPosition) * screenWidth;

  switch (transition) {
    case 'instant':
      instance.animatedOpacity.setValue(targetOpacity);
      instance.animatedTranslateX.setValue(targetX);
      instance.animatedScale.setValue(targetScale);
      return null;

    case 'fade':
      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(instance.animatedOpacity, { toValue: targetOpacity, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(instance.animatedTranslateX, { toValue: targetX, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ]);

    case 'slide':
      if (action.type === 'show') {
        const startX = targetX + (targetX < 0 ? -screenWidth : screenWidth);
        instance.animatedTranslateX.setValue(startX);
        instance.animatedOpacity.setValue(0);
      }

      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(instance.animatedTranslateX, { toValue: targetX, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(instance.animatedOpacity, { toValue: targetOpacity, duration: duration * OPACITY_SLIDE_SHOW_RATIO, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ]);

    case 'zoom':
      if (action.type === 'show') {
        instance.animatedScale.setValue(ZOOM_INITIAL_SCALE);
        instance.animatedOpacity.setValue(0);
      }

      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.spring(instance.animatedScale, { toValue: targetScale, tension: 50, friction: 7, useNativeDriver: true }),
          Animated.timing(instance.animatedOpacity, { toValue: targetOpacity, duration: duration * OPACITY_ZOOM_SHOW_RATIO, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(instance.animatedTranslateX, { toValue: targetX, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
      ]);

    case 'shake':
      return Animated.sequence([
        Animated.delay(delay),
        createShakeSequence(
          instance.animatedTranslateX,
          [targetX - SHAKE_AMPLITUDE, targetX + SHAKE_AMPLITUDE,
           targetX - SHAKE_AMPLITUDE, targetX + SHAKE_AMPLITUDE, targetX],
          SHAKE_STEP_DURATION,
        ),
      ]);

    default:
      return null;
  }
}

export function createScreenShakeAnimation(
  shakeValue: Animated.Value,
  intensity: number = SHAKE_AMPLITUDE,
  duration: number = 300,
): Animated.CompositeAnimation {
  const stepDuration = duration / SHAKE_STEP_COUNT;
  const targets = SHAKE_DECAY_FACTORS.map((f, i) => intensity * f * (i % 2 === 0 ? 1 : -1));
  return createShakeSequence(shakeValue, [...targets, 0], stepDuration);
}

export function createHideAnimation(
  instance: AnimatedCharacterInstance,
  transition: CharacterTransition = 'fade',
  duration: number = 300,
  screenWidth: number,
): Animated.CompositeAnimation {
  switch (transition) {
    case 'instant':
      instance.animatedOpacity.setValue(0);
      return Animated.timing(instance.animatedOpacity, { toValue: 0, duration: 0, useNativeDriver: true });

    case 'slide':
      return Animated.parallel([
        Animated.timing(instance.animatedTranslateX, { toValue: screenWidth, duration, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(instance.animatedOpacity, { toValue: 0, duration: duration * OPACITY_SLIDE_HIDE_RATIO, useNativeDriver: true }),
      ]);

    case 'zoom':
      return Animated.parallel([
        Animated.timing(instance.animatedScale, { toValue: ZOOM_EXIT_SCALE, duration, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(instance.animatedOpacity, { toValue: 0, duration, useNativeDriver: true }),
      ]);

    case 'fade':
    default:
      return Animated.timing(instance.animatedOpacity, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
  }
}

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
