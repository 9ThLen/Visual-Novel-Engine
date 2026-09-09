import {
  DEFAULT_READER_LAYOUT_PRESET,
  mergeReaderColors,
  sanitizeReaderLayoutPreset,
  sanitizeStoryTheme,
  STORY_THEME_PRESETS,
} from '@/lib/story-theme';

describe('sanitizeReaderLayoutPreset', () => {
  it.each(['classic', 'compact', 'top'] as const)('accepts %s', (preset) => {
    expect(sanitizeReaderLayoutPreset(preset)).toBe(preset);
  });

  it('falls back to classic for arbitrary input without throwing', () => {
    const values: unknown[] = [undefined, null, '', 'bottom', 'TOP', 1, false, {}, [], Symbol('preset')];
    for (const value of values) {
      expect(sanitizeReaderLayoutPreset(value)).toBe(DEFAULT_READER_LAYOUT_PRESET);
    }
  });
});

describe('sanitizeStoryTheme', () => {
  it('normalizes short, long, alpha hex colors, and casing', () => {
    expect(sanitizeStoryTheme({
      dialogueBg: '#AbC',
      dialogueText: '#A1B2C3',
      choiceBg: '#A1B2C3D4',
    })).toEqual({
      dialogueBg: '#aabbcc',
      dialogueText: '#a1b2c3',
      choiceBg: '#a1b2c3d4',
    });
  });

  it('silently discards invalid values and unknown keys', () => {
    expect(sanitizeStoryTheme({
      dialogueBg: '#123456',
      dialogueText: 42,
      dialogueBorder: null,
      nameBg: 'red',
      nameText: 'rgb(1,2,3)',
      choiceBg: 'oklch(50% 0.1 20)',
      unknown: '#abcdef',
    })).toEqual({ dialogueBg: '#123456' });
  });

  it('returns undefined for non-objects or an empty sanitized result', () => {
    expect(sanitizeStoryTheme(null)).toBeUndefined();
    expect(sanitizeStoryTheme('#ffffff')).toBeUndefined();
    expect(sanitizeStoryTheme({ dialogueBg: 'blue', ignored: '#ffffff' })).toBeUndefined();
  });
});

describe('mergeReaderColors', () => {
  const palette = {
    dialogueBg: '#000000',
    dialogueText: '#ffffff',
    choiceText: '#eeeeee',
    globalToken: '#123456',
  };

  it('overrides only fields supplied by a partial theme', () => {
    expect(mergeReaderColors(palette, {
      dialogueBg: '#abcdef',
      choiceText: '#fedcba',
    })).toEqual({
      dialogueBg: '#abcdef',
      dialogueText: '#ffffff',
      choiceText: '#fedcba',
      globalToken: '#123456',
    });
  });

  it('preserves an alpha hex dialogue background through sanitize and merge', () => {
    const dialogueBg = '#11223380';
    const sanitized = sanitizeStoryTheme({ dialogueBg });

    expect(mergeReaderColors(palette, sanitized).dialogueBg).toBe(dialogueBg);
  });

  it('returns the palette values unchanged when no theme is supplied', () => {
    expect(mergeReaderColors(palette)).toEqual(palette);
  });
});

describe('STORY_THEME_PRESETS', () => {
  it('keeps every preset complete and valid after sanitization', () => {
    for (const preset of STORY_THEME_PRESETS) {
      expect(preset.nameKey).toBe(`themeStudio.preset.${preset.id}`);
      expect(sanitizeStoryTheme(preset.theme)).toEqual(preset.theme);
      expect(Object.keys(preset.theme)).toHaveLength(8);
    }
  });
});
