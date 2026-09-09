import React from 'react';
import { Image, Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { characterPositionCenterFraction } from '@/lib/character-position';
import type { AnimatedCharacterInstance } from '@/lib/character-animator';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';

interface Props {
  instance: AnimatedCharacterInstance;
  spriteUri: string;
  position?: 'far-left' | 'left' | 'center' | 'right' | 'far-right';
  isActiveSpeaker?: boolean;
  dimmed?: boolean;
  focusScale?: number;
  overlay?: React.ReactNode;
}

function positionPercent(position: Props['position']): `${number}%` {
  return `${characterPositionCenterFraction(position) * 100}%`;
}

export const CharacterDisplay = React.memo(function CharacterDisplay({
  instance,
  spriteUri,
  position,
  isActiveSpeaker = false,
  dimmed = false,
  focusScale = 1.04,
  overlay,
}: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const charWidth = screenWidth * 0.35;
  const activeScale = isActiveSpeaker ? focusScale : 1;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 0,
        left: positionPercent(position || instance.position),
        width: charWidth,
        opacity: dimmed
          ? Animated.multiply(instance.animatedOpacity, 0.58)
          : instance.animatedOpacity,
        transform: [
          { translateX: -charWidth / 2 },
          { translateX: instance.animatedTranslateX },
          { translateY: instance.animatedTranslateY },
          { scale: Animated.multiply(instance.animatedScale, activeScale) },
        ],
        zIndex: instance.zIndex || 0,
        ...getPointerEventsStyle('none'),
      }}
      accessible={true}
      accessibilityLabel={spriteUri ? 'Character sprite' : 'Character sprite missing'}
    >
      {spriteUri ? (
        <Image
          source={{ uri: spriteUri }}
          style={{ width: '100%', aspectRatio: 9 / 16, maxHeight: screenHeight * 0.65 }}
          resizeMode="contain"
        />
      ) : (
        <View
          style={{
            width: '100%',
            aspectRatio: 9 / 16,
            maxHeight: screenHeight * 0.65,
            backgroundColor: 'transparent',
          }}
        />
      )}
      {overlay ? <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>{overlay}</View> : null}
    </Animated.View>
  );
});
