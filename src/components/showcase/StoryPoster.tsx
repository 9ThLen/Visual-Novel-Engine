/**
 * A 2:3 poster — the shelf unit. Falls back through cover → opening background
 * → a seeded colour with the title's initial, so a story without art still
 * looks chosen rather than missing.
 */

import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';


import { ShowcaseImage } from '@/components/showcase/ShowcaseImage';
import { Fonts, withAlpha } from '@/lib/_core/theme';
import { SHOWCASE_COLORS } from '@/lib/showcase/showcase-colors';
import { posterFallbackForSeed, type ShowcaseStory } from '@/lib/showcase/story-showcase';
import { buttonFeedback } from '@/lib/ui-feedback';

export const POSTER_WIDTH = 150;
const POSTER_HEIGHT = Math.round((POSTER_WIDTH * 3) / 2);

export interface StoryPosterProps {
  story: ShowcaseStory;
  posterAsset: string | null;
  caption: string;
  onPress: (storyId: string) => void;
}

export const StoryPoster = memo(function StoryPoster({
  story,
  posterAsset,
  caption,
  onPress,
}: StoryPosterProps) {
  const fallback = useMemo(() => posterFallbackForSeed(story.id), [story.id]);
  const initial = story.title.trim().charAt(0).toUpperCase() || '?';
  return (
    <Pressable
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.82 : 1 }]}
      onPress={() => {
        buttonFeedback();
        onPress(story.id);
      }}
      accessibilityRole="button"
      accessibilityLabel={story.title}
    >
      <View style={[styles.frame, { backgroundColor: fallback.bg }]}>
        <Text style={[styles.initial, { color: fallback.ink }]}>{initial}</Text>
        {/* A hairline in the ink colour gives the flat pastel a printed edge. */}
        <View style={[styles.frameBorder, { borderColor: withAlpha(fallback.ink, 0.18) }]} pointerEvents="none" />
        {posterAsset ? (
          <ShowcaseImage assetRef={posterAsset} style={styles.imageOverlay} resizeMode="cover" />
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {story.title}
      </Text>
      <Text style={styles.caption} numberOfLines={1}>
        {caption}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: POSTER_WIDTH,
    gap: 6,
  },
  frame: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Layered over the initial so a slow-resolving asset never flashes a blank
  // card. Width/height are explicit: without them a bundled source falls back to
  // its intrinsic size and blows out of the frame.
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  frameBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 1,
  },
  initial: {
    fontSize: 72,
    fontFamily: Fonts.serif,
    fontWeight: '700',
  },
  title: {
    color: SHOWCASE_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  caption: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 12,
  },
});
