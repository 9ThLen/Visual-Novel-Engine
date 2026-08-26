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
    id: 'parchment',
    nameKey: 'themeStudio.preset.parchment',
    theme: {
      dialogueBg: '#f7f1e6f2',
      dialogueText: '#33291f',
      dialogueBorder: '#d8c7ab',
      nameBg: '#6b5b3e',
      nameText: '#faf5ea',
      choiceBg: '#efe5d4',
      choiceBorder: '#b9a582',
      choiceText: '#33291f',
    },
  },
  {
    id: 'midnight',
    nameKey: 'themeStudio.preset.midnight',
    theme: {
      dialogueBg: '#0e1116f0',
      dialogueText: '#dfe3ea',
      dialogueBorder: '#2b3340',
      nameBg: '#222b38',
      nameText: '#cfd8e6',
      choiceBg: '#161c25f0',
      choiceBorder: '#3d4a5c',
      choiceText: '#dfe3ea',
    },
  },
  {
    id: 'ember',
    nameKey: 'themeStudio.preset.ember',
    theme: {
      dialogueBg: '#12100bf5',
      dialogueText: '#f0c46a',
      dialogueBorder: '#7a5a22',
      nameBg: '#2a2110',
      nameText: '#ffd98a',
      choiceBg: '#1a1610f0',
      choiceBorder: '#a97c2c',
      choiceText: '#f0c46a',
    },
  },
  {
    id: 'mist',
    nameKey: 'themeStudio.preset.mist',
    theme: {
      dialogueBg: '#eef0ecf2',
      dialogueText: '#2f3630',
      dialogueBorder: '#c3cbc0',
      nameBg: '#4c5a4d',
      nameText: '#f2f5f0',
      choiceBg: '#e2e7df',
      choiceBorder: '#a7b2a3',
      choiceText: '#2f3630',
    },
  },
];
