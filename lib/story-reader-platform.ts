import type { TextStyle, ViewStyle } from 'react-native';

export function getStoryReaderContainerStyle(
  colors?: { background?: string }
): Pick<ViewStyle, 'backgroundColor' | 'overflow'> {
  return {
    backgroundColor: colors?.background ?? '#000000',
    overflow: 'hidden',
  };
}

export function getStoryReaderSpeakerTextStyle(
  colors?: { foreground?: string }
): Pick<TextStyle, 'color'> {
  return {
    color: colors?.foreground ?? '#ffffff',
  };
}
