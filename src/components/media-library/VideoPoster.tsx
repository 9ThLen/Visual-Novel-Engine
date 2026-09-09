/**
 * The square for a video clip: a still from the clip itself where one can be
 * had, and the film glyph where it cannot.
 *
 * The lease is what keeps the resolver from revoking the clip's object URL
 * while the frame is being grabbed; it is released as soon as the poster
 * exists, because the poster is a reference of its own and no longer depends
 * on it.
 *
 * `expo-image` rather than the RN one: a phone's poster is a native image
 * reference, not a URI, and only this component can draw both.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { acquireResolvedAssetUri } from '@/lib/asset-resolver';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { spacing } from '@/lib/design-tokens';
import { getVideoPosterSource, type PosterSource } from '@/lib/video-poster';
import type { StoryMediaItem } from '@/lib/story-media-gallery';

export function VideoPoster({
  item,
  colors,
  glyphSize = 28,
}: {
  item: StoryMediaItem;
  colors: ThemeColorPalette;
  glyphSize?: number;
}) {
  const [poster, setPoster] = useState<PosterSource | null>(null);
  const reference = item.assetId ?? item.uri;

  useEffect(() => {
    let active = true;
    setPoster(null);

    void acquireResolvedAssetUri(reference)
      .then(async (lease) => {
        try {
          // A number is a bundled asset the packager already sized; there is no
          // URI to hand a player, and nothing to grab a frame from.
          if (typeof lease.source !== 'string') return;
          const source = await getVideoPosterSource(lease.source);
          if (active && source) setPoster(source);
        } finally {
          lease.release();
        }
      })
      .catch(() => {
        // No poster is a state the tile already knows how to draw.
      });

    return () => { active = false; };
  }, [reference]);

  if (poster) {
    return <Image source={poster} style={styles.fill} contentFit="cover" />;
  }

  return (
    <View style={[styles.placeholder, { backgroundColor: colors.background }]}>
      <IconSymbol name="movie" size={glyphSize} color={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  placeholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
});
