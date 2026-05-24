import React from 'react';
import { Image, Animated, useWindowDimensions } from 'react-native';
import type { AnimatedCharacterInstance } from '@/lib/character-animator';

interface Props {
  instance: AnimatedCharacterInstance;
  spriteUri: string;
  dialogueTop?: number;
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
      }}
      pointerEvents="none"
    >
      <Image
        source={spriteUri ? { uri: spriteUri } : { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }}
        style={{ width: '100%', aspectRatio: 9 / 16, maxHeight: screenHeight * 0.65 }}
        resizeMode="contain"
      />
    </Animated.View>
  );
});
