import { describe, expect, it } from 'vitest';

import { normalizeUserSettings } from '@/lib/user-settings';

describe('normalizeUserSettings', () => {
  it('fills missing settings with defaults', () => {
    expect(normalizeUserSettings({ sfxVolume: 0.25 })).toEqual({
      bgmVolume: 0.7,
      voiceVolume: 0.8,
      sfxVolume: 0.25,
      textSpeed: 0.5,
      textSize: 'medium',
      autoPlay: false,
    });
  });

  it('clamps invalid numeric values', () => {
    expect(
      normalizeUserSettings({
        bgmVolume: -1,
        voiceVolume: 4,
        sfxVolume: Number.NaN,
        textSpeed: 2,
      }),
    ).toEqual({
      bgmVolume: 0,
      voiceVolume: 1,
      sfxVolume: 0.7,
      textSpeed: 1,
      textSize: 'medium',
      autoPlay: false,
    });
  });
});
