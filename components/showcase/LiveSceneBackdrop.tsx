/**
 * components/showcase/LiveSceneBackdrop.tsx — the showcase's living frame.
 *
 * A still poster says a story exists; a drifting, raining scene says it is
 * happening. This replays only what a still frame can carry — image, parallax,
 * weather — and deliberately never mounts the reader: the home screen must open
 * instantly, and a running engine behind a banner is what makes it not.
 *
 * Dumb by contract: no stores, no router, no i18n. Everything arrives as props.
 */

import React, { memo, useMemo } from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { PARALLAX_LAYERS, useParallaxLayer } from '@/components/reader/useParallaxLayer';
import { WeatherEffectsLayer } from '@/components/reader/WeatherEffectsLayer';
import { ShowcaseImage } from '@/components/showcase/ShowcaseImage';
import { ShowcaseScrim } from '@/components/showcase/ShowcaseScrim';
import type { ActiveEffect } from '@/lib/engine/runtime-types';
import { fallbackColorForSeed, type ShowcaseBannerEffect } from '@/lib/showcase/story-showcase';
import { SHOWCASE_COLORS } from '@/lib/showcase/showcase-colors';

export interface LiveSceneBackdropProps {
  /** Asset reference (library id, bundled path or media uri), not a resolved uri. */
  backgroundAsset: string | null;
  effect: ShowcaseBannerEffect | null;
  /** Drives the fallback colour — stable per story, so use the story id. */
  fallbackSeed: string;
  /** Shown large behind the fallback colour; the story's title. */
  fallbackLabel: string;
  height: number;
  /** Opacity of the gradient at its darkest point, under the content. */
  scrimOpacity?: number;
  parallaxEnabled?: boolean;
  children?: React.ReactNode;
}

const DEFAULT_SCRIM_OPACITY = 0.55;
/** The gradient covers the lower half; the top of the frame stays clean. */
const SCRIM_HEIGHT_RATIO = 0.55;
const BANNER_EFFECT_INTENSITY = 45;

export const LiveSceneBackdrop = memo(function LiveSceneBackdrop({
  backgroundAsset,
  effect,
  fallbackSeed,
  fallbackLabel,
  height,
  scrimOpacity = DEFAULT_SCRIM_OPACITY,
  parallaxEnabled = true,
  children,
}: LiveSceneBackdropProps) {
  const parallaxStyle = useParallaxLayer(parallaxEnabled && !!backgroundAsset, PARALLAX_LAYERS.background);
  const fallbackColor = useMemo(() => fallbackColorForSeed(fallbackSeed), [fallbackSeed]);
  const initial = useMemo(() => fallbackLabel.trim().charAt(0).toUpperCase() || '?', [fallbackLabel]);

  // The banner has no runtime clock, so the effect is pinned open: it starts in
  // the past and ends far enough ahead that it never expires while on screen.
  const effects = useMemo<ActiveEffect[]>(() => {
    if (!effect) return [];
    return [{
      effectType: effect,
      target: 'screen',
      intensity: BANNER_EFFECT_INTENSITY,
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
    }];
  }, [effect]);

  const scrimHeight = Math.round(height * SCRIM_HEIGHT_RATIO);
  const containerStyle: ViewStyle = { height, backgroundColor: fallbackColor };

  return (
    <View style={[styles.container, containerStyle]}>
      {backgroundAsset ? (
        <Animated.View style={[StyleSheet.absoluteFill, parallaxStyle]}>
          <ShowcaseImage assetRef={backgroundAsset} style={styles.image} resizeMode="cover" />
        </Animated.View>
      ) : (
        <View style={styles.fallback} pointerEvents="none">
          <Text style={styles.fallbackInitial}>{initial}</Text>
        </View>
      )}

      {effects.length > 0 && Platform.OS === 'web' ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <WeatherEffectsLayer effects={effects} target="screen" />
        </View>
      ) : null}

      {/* A gradient, not a block: a hard edge across the frame reads as a bug. */}
      <View style={[styles.scrim, { height: scrimHeight }]} pointerEvents="none">
        <ShowcaseScrim opacity={scrimOpacity} />
      </View>

      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    // The parallax preset overscans the image; without this it shows its edges.
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackInitial: {
    fontSize: 180,
    fontWeight: '800',
    color: `${SHOWCASE_COLORS.text}14`,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
});
