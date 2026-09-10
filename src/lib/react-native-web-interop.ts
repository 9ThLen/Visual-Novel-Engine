import type { ViewStyle } from 'react-native';

export function shouldUseNativeDriverForPlatform(platformOS: string) {
  return platformOS !== 'web';
}

export function getPointerEventsStyle(
  pointerEvents: NonNullable<ViewStyle['pointerEvents']>,
): Pick<ViewStyle, 'pointerEvents'> {
  return { pointerEvents };
}
