/**
 * Character Display Component
 * Renders animated characters in story reader
 */

import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import type { AnimatedCharacterInstance } from '@/lib/character-animator';

interface Props {
  instance: AnimatedCharacterInstance;
  spriteUri: string;
}

export function CharacterDisplay(props: Props) {
  return <MemoizedCharacterDisplay {...props} />;
}

const MemoizedCharacterDisplay = React.memo(({ instance, spriteUri }: Props) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: instance.animatedOpacity,
          transform: [
            { translateX: instance.animatedTranslateX },
            { translateY: instance.animatedTranslateY },
            { scale: instance.animatedScale },
          ],
          zIndex: instance.zIndex || 0,
        },
      ]}
      pointerEvents="none"
    >
      <Image
        source={{ uri: spriteUri }}
        style={[
          styles.image,
          {
            maxHeight: screenHeight * 0.7,
            maxWidth: screenWidth * 0.4,
          },
        ]}
        resizeMode="contain"
      />
    </Animated.View>
  );
});
MemoizedCharacterDisplay.displayName = 'CharacterDisplay';
