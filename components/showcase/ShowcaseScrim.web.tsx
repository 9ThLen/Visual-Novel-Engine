/**
 * Web scrim: a real CSS gradient, following the raw-div precedent in
 * components/reader/VisualEffectsOverlay.web.tsx. A solid block here would draw
 * a hard line across the middle of the banner.
 */

import React, { memo } from 'react';

import { SHOWCASE_COLORS } from '@/lib/showcase/showcase-colors';
import type { ShowcaseScrimProps } from './ShowcaseScrim';

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

export const ShowcaseScrim = memo(function ShowcaseScrim({ opacity }: ShowcaseScrimProps) {
  const stops = [
    `${rgba(SHOWCASE_COLORS.scrim, 0)} 0%`,
    `${rgba(SHOWCASE_COLORS.scrim, opacity * 0.45)} 45%`,
    `${rgba(SHOWCASE_COLORS.scrim, opacity * 0.8)} 75%`,
    `${rgba(SHOWCASE_COLORS.scrim, Math.min(1, opacity + 0.35))} 100%`,
  ];

  return (
    <div
      data-testid="showcase-scrim"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `linear-gradient(to bottom, ${stops.join(', ')})`,
      }}
    />
  );
});

export type { ShowcaseScrimProps };
