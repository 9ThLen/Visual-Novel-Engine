import type { TextStyle, ViewStyle } from 'react-native';

export function getStoryReaderContainerStyle(): Pick<
  ViewStyle,
  'backgroundColor' | 'overflow'
> {
  return {
    backgroundColor: '#000000',
    overflow: 'hidden',
  };
}

export function getStoryReaderSpeakerTextStyle(): Pick<TextStyle, 'color'> {
  return {
    color: '#ffffff',
  };
}
