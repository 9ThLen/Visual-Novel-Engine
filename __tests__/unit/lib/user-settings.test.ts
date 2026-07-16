import { defaultUserSettings, mergeLegacyUserSettings, normalizeUserSettings } from '@/lib/user-settings';
import { pointerToParallaxOffset } from '@/components/reader/useParallaxLayer';

describe('normalizeUserSettings', () => {
  it('defaults parallaxEnabled to true', () => {
    expect(normalizeUserSettings(null).parallaxEnabled).toBe(true);
    expect(normalizeUserSettings({}).parallaxEnabled).toBe(true);
    expect(defaultUserSettings.parallaxEnabled).toBe(true);
  });

  it('preserves an explicit parallaxEnabled value', () => {
    expect(normalizeUserSettings({ parallaxEnabled: false }).parallaxEnabled).toBe(false);
    expect(normalizeUserSettings({ parallaxEnabled: true }).parallaxEnabled).toBe(true);
  });

  it('falls back to the default for a non-boolean parallaxEnabled', () => {
    expect(
      normalizeUserSettings({ parallaxEnabled: 'yes' as unknown as boolean }).parallaxEnabled,
    ).toBe(true);
  });
});

describe('mergeLegacyUserSettings', () => {
  it('preserves hydrated permissions when a legacy record has none', () => {
    const current = normalizeUserSettings({ aiPermissions: { ...defaultUserSettings.aiPermissions, scene_edit: 'blocked' } });
    expect(mergeLegacyUserSettings({ bgmVolume: 0.25 }, current).aiPermissions.scene_edit).toBe('blocked');
  });
});

describe('pointerToParallaxOffset', () => {
  it('maps the viewport center to 0 and edges to ±1', () => {
    expect(pointerToParallaxOffset(500, 1000)).toBe(0);
    expect(pointerToParallaxOffset(0, 1000)).toBe(-1);
    expect(pointerToParallaxOffset(1000, 1000)).toBe(1);
  });

  it('clamps positions outside the viewport', () => {
    expect(pointerToParallaxOffset(-200, 1000)).toBe(-1);
    expect(pointerToParallaxOffset(1500, 1000)).toBe(1);
  });

  it('returns 0 for invalid extents', () => {
    expect(pointerToParallaxOffset(100, 0)).toBe(0);
    expect(pointerToParallaxOffset(100, Number.NaN)).toBe(0);
  });
});
