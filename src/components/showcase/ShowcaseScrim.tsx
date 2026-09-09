/**
 * Native scrim. React Native has no gradient primitive and the project takes no
 * new dependencies, so the fade is built from stacked bands — enough of them
 * that the steps read as a gradient rather than as stripes. The web build uses
 * a real CSS gradient (ShowcaseScrim.web.tsx).
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHOWCASE_COLORS } from '@/lib/showcase/showcase-colors';

export interface ShowcaseScrimProps {
  /** Opacity at the bottom edge, where content sits. */
  opacity: number;
}

const BANDS = 14;

export const ShowcaseScrim = memo(function ShowcaseScrim({ opacity }: ShowcaseScrimProps) {
  const bands = useMemo(
    () =>
      Array.from({ length: BANDS }, (_, index) => {
        const progress = (index + 1) / BANDS;
        return {
          key: index,
          // Eased so the top edge stays invisible and the darkness gathers low.
          opacity: opacity * progress * progress,
          flex: 1,
        };
      }),
    [opacity],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bands.map((band) => (
        <View
          key={band.key}
          style={{ flex: band.flex, backgroundColor: SHOWCASE_COLORS.scrim, opacity: band.opacity }}
        />
      ))}
    </View>
  );
});
