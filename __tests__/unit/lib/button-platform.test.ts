import { describe, expect, it } from 'vitest';

import {
  getButtonOverlayPointerEventsStyle,
  shouldUseNativeDriver,
} from '@/lib/button-platform';

describe('button platform helpers', () => {
  it('disables native driver on web', () => {
    expect(shouldUseNativeDriver('web')).toBe(false);
  });

  it('keeps native driver on native platforms', () => {
    expect(shouldUseNativeDriver('ios')).toBe(true);
    expect(shouldUseNativeDriver('android')).toBe(true);
  });

  it('moves pointer events into style for web-safe overlays', () => {
    expect(getButtonOverlayPointerEventsStyle()).toEqual({
      pointerEvents: 'none',
    });
  });
});
