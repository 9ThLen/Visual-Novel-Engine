export interface StoryReaderTheme {
  dialogueBg?: string;
  dialogueText?: string;
  dialogueBorder?: string;
  nameBg?: string;
  nameText?: string;
  choiceBg?: string;
  choiceBorder?: string;
  choiceText?: string;
}

export const STORY_READER_LAYOUT_PRESETS = ['classic', 'compact', 'top'] as const;
export type StoryReaderLayoutPreset = (typeof STORY_READER_LAYOUT_PRESETS)[number];
export const DEFAULT_READER_LAYOUT_PRESET: StoryReaderLayoutPreset = 'classic';

export function sanitizeReaderLayoutPreset(input: unknown): StoryReaderLayoutPreset {
  return typeof input === 'string'
    && (STORY_READER_LAYOUT_PRESETS as readonly string[]).includes(input)
    ? input as StoryReaderLayoutPreset
    : DEFAULT_READER_LAYOUT_PRESET;
}

const THEME_KEYS = [
  'dialogueBg',
  'dialogueText',
  'dialogueBorder',
  'nameBg',
  'nameText',
  'choiceBg',
  'choiceBorder',
  'choiceText',
] as const;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function normalizeColor(value: string): string | undefined {
  if (!HEX_COLOR.test(value)) return undefined;

  const color = value.toLowerCase();
  if (color.length !== 4) return color;

  return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
}

export function sanitizeStoryTheme(input: unknown): StoryReaderTheme | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;

  const source = input as Record<string, unknown>;
  const theme: StoryReaderTheme = {};

  for (const key of THEME_KEYS) {
    const value = source[key];
    if (typeof value !== 'string') continue;

    const color = normalizeColor(value);
    if (color) theme[key] = color;
  }

  return Object.keys(theme).length > 0 ? theme : undefined;
}

export function mergeReaderColors<T extends Record<string, string>>(palette: T, theme?: StoryReaderTheme): T {
  const definedTheme = Object.fromEntries(
    Object.entries(theme ?? {}).filter(([, value]) => value !== undefined),
  );

  return { ...palette, ...definedTheme } as T;
}

export const STORY_THEME_PRESETS: { id: string; nameKey: string; theme: StoryReaderTheme }[] = [
  {
    id: 'classic',
    nameKey: 'themeStudio.preset.classic',
    theme: {
      dialogueBg: '#111827dd',
      dialogueText: '#f9fafb',
      dialogueBorder: '#d1d5db99',
      nameBg: '#374151ee',
      nameText: '#ffffff',
      choiceBg: '#1f2937ee',
      choiceBorder: '#9ca3af',
      choiceText: '#f9fafb',
    },
  },
  {
    id: 'night',
    nameKey: 'themeStudio.preset.night',
    theme: {
      dialogueBg: '#070d1aff',
      dialogueText: '#dbeafe',
      dialogueBorder: '#1e3a8a',
      nameBg: '#0f172aff',
      nameText: '#93c5fd',
      choiceBg: '#111c33ff',
      choiceBorder: '#2563eb',
      choiceText: '#bfdbfe',
    },
  },
  {
    id: 'soft',
    nameKey: 'themeStudio.preset.soft',
    theme: {
      dialogueBg: '#fffaf5f2',
      dialogueText: '#3f3a4a',
      dialogueBorder: '#e9cfd3',
      nameBg: '#f6dce1',
      nameText: '#5a3340',
      choiceBg: '#e8def8',
      choiceBorder: '#c8b6e2',
      choiceText: '#453b5c',
    },
  },
  {
    id: 'retro',
    nameKey: 'themeStudio.preset.retro',
    theme: {
      dialogueBg: '#111008f2',
      dialogueText: '#ffbf4d',
      dialogueBorder: '#b8741a',
      nameBg: '#2a1b08',
      nameText: '#ffd27a',
      choiceBg: '#1c1608',
      choiceBorder: '#d99024',
      choiceText: '#ffbf4d',
    },
  },
];
