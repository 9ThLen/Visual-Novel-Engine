import React from 'react';
import { Image, Animated, useWindowDimensions, View } from 'react-native';
import type { AnimatedCharacterInstance } from '@/lib/character-animator';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';

interface Props {
  instance: AnimatedCharacterInstance;
  spriteUri: string;
}

export const CharacterDisplay = React.memo(function CharacterDisplay({ instance, spriteUri }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const charWidth = screenWidth * 0.35;

  return (
    <Animated.View
      style={{
        width: charWidth,
        opacity: instance.animatedOpacity,
        transform: [
          { translateX: instance.animatedTranslateX },
          { translateY: instance.animatedTranslateY },
          { scale: instance.animatedScale },
        ],
        zIndex: instance.zIndex || 0,
        ...getPointerEventsStyle('none'),
      }}
    >
      {spriteUri ? (
      <Image
        source={{ uri: spriteUri }}
        style={{ width: '100%', aspectRatio: 9 / 16, maxHeight: screenHeight * 0.65 }}
        resizeMode="contain"
      />
    ) : (
      <View style={{ width: '100%', aspectRatio: 9 / 16, maxHeight: screenHeight * 0.65 }} />
    )}
    </Animated.View>
  );
});
