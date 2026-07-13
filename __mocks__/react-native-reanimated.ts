const { View, Text } = require('react-native');

const Animated = {
  View,
  Text,
};

export default Animated;
export { View, Text };

export const useSharedValue = <T>(initialValue: T) => ({ value: initialValue });
export const makeMutable = <T>(initialValue: T) => ({ value: initialValue });
export const useAnimatedStyle = (factory: () => Record<string, unknown>) => factory();
export const withTiming = (toValue: unknown) => toValue;
export const withSpring = (toValue: unknown) => toValue;
export const ReduceMotion = { Never: 'never', Always: 'always', System: 'system' };
export const withRepeat = (animation: unknown) => animation;
export const withSequence = (...animations: unknown[]) => animations[animations.length - 1];
export const cancelAnimation = () => {};
export const Easing = {
  linear: (t: number) => t,
  sin: (t: number) => t,
  inOut: (fn: (t: number) => number) => fn,
};
