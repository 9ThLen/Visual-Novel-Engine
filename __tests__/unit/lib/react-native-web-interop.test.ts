import { describe, expect, it } from 'vitest';

import {
  getPointerEventsStyle,
  shouldUseNativeDriverForPlatform,
} from '@/lib/react-native-web-interop';

describe('react native web interop helpers', () => {
  it('moves pointer events into style objects', () => {
    expect(getPointerEventsStyle('none')).toEqual({ pointerEvents: 'none' });
    expect(getPointerEventsStyle('box-none')).toEqual({ pointerEvents: 'box-none' });
    expect(getPointerEventsStyle('auto')).toEqual({ pointerEvents: 'auto' });
  });

  it('disables native driver on web only', () => {
    expect(shouldUseNativeDriverForPlatform('web')).toBe(false);
    expect(shouldUseNativeDriverForPlatform('ios')).toBe(true);
    expect(shouldUseNativeDriverForPlatform('android')).toBe(true);
  });
});
