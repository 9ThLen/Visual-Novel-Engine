import type { TextStyle, ViewStyle } from 'react-native';

// null is intentional: consumer must pass colors explicitly per platform
// contract. We no longer fall back to hardcoded black/white, which would
// undermine the OKLCH theme on Android/iOS native reader builds.
// React Native renders `backgroundColor: null` / `color: null` as
// "no override" (transparent / inherited) at runtime, so the type cast
// below is sound — we just expose what RN already supports at runtime.

export function getStoryReaderContainerStyle(
  colors?: { background?: string }
): Pick<ViewStyle, 'overflow' | 'backgroundColor'> {
  return {
    backgroundColor: colors?.background ?? undefined,
    overflow: 'hidden',
  };
}

export function getStoryReaderSpeakerTextStyle(
  colors?: { foreground?: string }
): Pick<TextStyle, 'color'> {
  return {
    color: colors?.foreground ?? undefined,
  };
}
