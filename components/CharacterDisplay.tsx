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

export function CharacterDisplay({ instance, spriteUri }: Props) {
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
            maxHeight: screenHeight * 0.7, // 70% of screen height
            maxWidth: screenWidth * 0.4, // 40% of screen width
          },
        ]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  image: {
    width: 300,
    height: 500,
  },
});
