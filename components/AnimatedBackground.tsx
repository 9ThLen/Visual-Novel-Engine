/**
 * Animated Background Component
 * Supports static images, videos, and animations
 */

import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import type { AnimatedBackground } from '@/lib/splash-types';

interface Props {
  background: AnimatedBackground;
}

export function AnimatedBackgroundComponent({ background }: Props) {
  const videoRef = useRef<Video>(null);
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in background
    Animated.timing(opacityAnim, {
      toValue: background.opacity ?? 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [background.uri]);

  if (background.type === 'static') {
    return (
      <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
        <Image
          source={{ uri: background.uri }}
          style={styles.image}
          resizeMode="cover"
        />
      </Animated.View>
    );
  }

  if (background.type === 'video' || background.type === 'animated') {
    return (
      <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
        <Video
          ref={videoRef}
          source={{ uri: background.uri }}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          isLooping={background.loop ?? true}
          shouldPlay
          isMuted={false}
          volume={0.3}
          rate={background.playbackRate ?? 1.0}
        />
      </Animated.View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
