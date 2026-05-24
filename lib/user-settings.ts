import type { UserSettings } from '@/lib/types';

export const defaultUserSettings: UserSettings = {
  bgmVolume: 0.7,
  voiceVolume: 0.8,
  sfxVolume: 0.7,
  textSpeed: 0.5,
  textSize: 'medium',
  autoPlay: false,
};

function clampUnitValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

export function normalizeUserSettings(
  settings: Partial<UserSettings> | null | undefined,
): UserSettings {
  return {
    bgmVolume: clampUnitValue(settings?.bgmVolume, defaultUserSettings.bgmVolume),
    voiceVolume: clampUnitValue(settings?.voiceVolume, defaultUserSettings.voiceVolume),
    sfxVolume: clampUnitValue(settings?.sfxVolume, defaultUserSettings.sfxVolume),
    textSpeed: clampUnitValue(settings?.textSpeed, defaultUserSettings.textSpeed),
    textSize:
      settings?.textSize === 'small' ||
      settings?.textSize === 'medium' ||
      settings?.textSize === 'large'
        ? settings.textSize
        : defaultUserSettings.textSize,
    autoPlay:
      typeof settings?.autoPlay === 'boolean' ? settings.autoPlay : defaultUserSettings.autoPlay,
  };
}
