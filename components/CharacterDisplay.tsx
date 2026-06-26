import React from 'react';
import { Image, Animated, useWindowDimensions, View } from 'react-native';
import type { AnimatedCharacterInstance } from '@/lib/character-animator';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';

interface Props {
  instance: AnimatedCharacterInstance;
  spriteUri: string;
  position?: 'far-left' | 'left' | 'center' | 'right' | 'far-right';
  isActiveSpeaker?: boolean;
  dimmed?: boolean;
  focusScale?: number;
}

function positionPercent(position: Props['position']): `${number}%` {
  switch (position) {
    case 'far-left':
      return '10%';
    case 'left':
      return '25%';
    case 'right':
      return '75%';
    case 'far-right':
      return '90%';
    case 'center':
    default:
      return '50%';
  }
}

export const CharacterDisplay = React.memo(function CharacterDisplay({
  instance,
  spriteUri,
  position,
  isActiveSpeaker = false,
  dimmed = false,
  focusScale = 1.04,
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
        opacity: dimmed ? 0.58 : instance.animatedOpacity,
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
          borderWidth: 1,
          borderColor: '#94a3b8',
          backgroundColor: 'rgba(148, 163, 184, 0.22)',
        }}
      />
    )}
    </Animated.View>
  );
});
