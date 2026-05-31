import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { SplashScreen, UITransition } from '@/lib/splash-types';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { useColors } from '@/hooks/use-colors';
import {
  getPointerEventsStyle,
  shouldUseNativeDriverForPlatform,
} from '@/lib/react-native-web-interop';

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
  const colors = useColors();
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const [isPlaying, setIsPlaying] = useState(true);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const useNativeDriver = shouldUseNativeDriverForPlatform(Platform.OS);

  // Only create video player for video/animation types
  const isVideo = splash.type === 'video' || splash.type === 'animation';
  const player = useVideoPlayer(null);

  const onCompleteRef = useRef(onComplete);
  const onUIHiddenRef = useRef(onUIHidden);
  const onUIShownRef = useRef(onUIShown);
  onCompleteRef.current = onComplete;
  onUIHiddenRef.current = onUIHidden;
  onUIShownRef.current = onUIShown;

  useEffect(() => {
    let mounted = true;
    resolveAssetUri(splash.uri).then((uri) => {
      if (!mounted) return;
      if (uri) {
        setResolvedUri(typeof uri === 'string' ? uri : String(uri));
      } else {
        if (__DEV__) console.warn('[SplashScreen] Failed to resolve splash URI:', splash.uri);
        onCompleteRef.current();
      }
    }).catch(err => {
      if (__DEV__) console.error('[SplashScreen] Error resolving splash URI:', err);
      if (mounted) onCompleteRef.current();
    });
    return () => { mounted = false; };
  }, [splash.uri]);

  useEffect(() => {
    if (resolvedUri && isVideo && player) {
      player.replace(resolvedUri);
      player.muted = false;
      player.volume = 0.5;
      player.play();
    }

    if (resolvedUri) {
      const fadeIn = splash.fadeIn ?? 500;
      const displayDuration = splash.duration ?? 2000;
      const fadeOut = splash.fadeOut ?? 500;

      const showDuration = fadeIn + displayDuration;

      Animated.timing(splashOpacity, {
        toValue: 1,
        duration: fadeIn,
        easing: getEasing(uiHideTransition?.easing),
        useNativeDriver,
      }).start(() => {
        onUIHiddenRef.current?.();
      });

      const hideTimer = setTimeout(() => {
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: fadeOut,
          easing: getEasing(uiShowTransition?.easing),
          useNativeDriver,
        }).start(() => {
          setIsPlaying(false);
          onUIShownRef.current?.();
          onCompleteRef.current();
        });
      }, showDuration);

      return () => clearTimeout(hideTimer);
    }
  }, [resolvedUri, splash.fadeIn, splash.fadeOut, splash.duration, uiHideTransition?.easing, uiShowTransition?.easing, splashOpacity, isVideo, player, useNativeDriver]);

  const getEasing = (type?: string) => {
    switch (type) {
      case 'linear': return Easing.linear;
      case 'ease-in': return Easing.in(Easing.ease);
      case 'ease-out': return Easing.out(Easing.ease);
      case 'ease-in-out': return Easing.inOut(Easing.ease);
      case 'ease': default: return Easing.ease;
    }
  };

  if (!isPlaying || !resolvedUri) return null;

  const source = typeof resolvedUri === 'string' ? { uri: resolvedUri } : resolvedUri;

  return (
    <Animated.View
      style={[styles.container, { opacity: splashOpacity, backgroundColor: colors.background }, getPointerEventsStyle('none')]}
    >
      {splash.type === 'image' && (
        <Image source={source} style={styles.media} resizeMode="cover" />
      )}
      {isVideo && player && (
        <VideoView player={player} style={styles.media} contentFit="cover" nativeControls={false} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 9999,
  },
  media: { width: '100%', height: '100%' },
});
