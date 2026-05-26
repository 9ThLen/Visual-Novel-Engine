import type { ViewStyle } from 'react-native';

export function shouldUseNativeDriver(platformOS: string) {
  return platformOS !== 'web';
}

export function getButtonOverlayPointerEventsStyle(): Pick<
  ViewStyle,
  'pointerEvents'
> {
  return {
    pointerEvents: 'none',
  };
}
