/**
 * Splash Screen Component
 * Fullscreen splash with UI hide/show transitions
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import type { SplashScreen, UITransition } from '@/lib/splash-types';

interface Props {
  splash: SplashScreen;
  uiHideTransition?: UITransition;
  uiShowTransition?: UITransition;
  onComplete: () => void;
  onUIHidden?: () => void;
  onUIShown?: () => void;
}

export function SplashScreenComponent({
  splash,
  uiHideTransition,
  uiShowTransition,
  onComplete,
  onUIHidden,
  onUIShown,
}: Props) {
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    playSplash();
  }, []);

  const playSplash = async () => {
    // Fade in splash
    Animated.timing(splashOpacity, {
      toValue: 1,
      duration: splash.fadeIn || 500,
      easing: getEasing(uiHideTransition?.easing),
      useNativeDriver: true,
    }).start(() => {
      onUIHidden?.();
    });

    // Wait for duration
    await new Promise((resolve) => setTimeout(resolve, splash.duration));

    // Fade out splash
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: splash.fadeOut || 500,
      easing: getEasing(uiShowTransition?.easing),
      useNativeDriver: true,
    }).start(() => {
      setIsPlaying(false);
      onUIShown?.();
      onComplete();
    });
  };

  const getEasing = (type?: string) => {
    switch (type) {
      case 'linear':
        return Easing.linear;
      case 'ease-in':
        return Easing.in(Easing.ease);
      case 'ease-out':
        return Easing.out(Easing.ease);
      case 'ease-in-out':
        return Easing.inOut(Easing.ease);
      case 'ease':
      default:
        return Easing.ease;
    }
  };

  if (!isPlaying) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: splashOpacity,
        },
      ]}
      pointerEvents="none"
    >
      {splash.type === 'image' && (
        <Image
          source={{ uri: splash.uri }}
          style={styles.media}
          resizeMode="cover"
        />
      )}

      {(splash.type === 'video' || splash.type === 'animation') && (
        <Video
          ref={videoRef}
          source={{ uri: splash.uri }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isMuted={false}
          volume={0.5}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: '#000',
  },
  media: {
    width: '100%',
    height: '100%',
  },
});
