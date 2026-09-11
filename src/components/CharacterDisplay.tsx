import React from 'react';
import { Image, Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { characterPositionCenterFraction } from '@/lib/character-position';
import { getCharacterSpriteSize } from '@/lib/character-layout';
import { useSpriteAspectRatio } from '@/hooks/use-sprite-aspect-ratio';
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
  /** Stage the sprite stands on. Falls back to the window when unmeasured. */
  stageWidth?: number;
  /** Stage height with the dialogue panel already subtracted. */
  stageHeight?: number;
  /** Characters sharing the stage; decides how much width each may claim. */
  characterCount?: number;
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
  stageWidth,
  stageHeight,
  characterCount = 1,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const aspectRatio = useSpriteAspectRatio(spriteUri);
  const { width: charWidth, height: charHeight } = getCharacterSpriteSize({
    stageWidth: stageWidth ?? windowWidth,
    stageHeight: stageHeight ?? windowHeight,
    aspectRatio,
    characterCount,
  });
  const activeScale = isActiveSpeaker ? focusScale : 1;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 0,
        left: positionPercent(position || instance.position),
        width: charWidth,
        height: charHeight,
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
          style={StyleSheet.absoluteFillObject}
          resizeMode="contain"
        />
      ) : null}
      {overlay ? <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>{overlay}</View> : null}
    </Animated.View>
  );
});
