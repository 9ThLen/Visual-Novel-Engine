export const readerFontScaleOptions = [0.85, 1.0, 1.15, 1.3] as const;
export const readerLineHeightScaleOptions = [1.0, 1.2, 1.4] as const;

export type ReaderFontScale = typeof readerFontScaleOptions[number];
export type ReaderLineHeightScale = typeof readerLineHeightScaleOptions[number];

export interface UserSettings {
  bgmVolume: number; // 0-1
  voiceVolume: number; // 0-1
  sfxVolume: number; // 0-1
  textSpeed: number; // 0-1 (slow to fast)
  textSize: 'small' | 'medium' | 'large';
  readerFontScale: ReaderFontScale;
  readerLineHeightScale: ReaderLineHeightScale;
  autoPlay: boolean;
}

export const defaultUserSettings: UserSettings = {
  bgmVolume: 0.7,
  voiceVolume: 0.8,
  sfxVolume: 0.7,
  textSpeed: 0.5,
  textSize: 'medium',
  readerFontScale: 1.0,
  readerLineHeightScale: 1.2,
  autoPlay: false,
};

function clampUnitValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function oneOfNumber<T extends number>(options: readonly T[], value: unknown, fallback: T): T {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return (options as readonly number[]).includes(value) ? value as T : fallback;
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
    readerFontScale: oneOfNumber(
      readerFontScaleOptions,
      settings?.readerFontScale,
      defaultUserSettings.readerFontScale,
    ),
    readerLineHeightScale: oneOfNumber(
      readerLineHeightScaleOptions,
      settings?.readerLineHeightScale,
      defaultUserSettings.readerLineHeightScale,
    ),
    autoPlay:
      typeof settings?.autoPlay === 'boolean' ? settings.autoPlay : defaultUserSettings.autoPlay,
  };
}
