/**
 * WCAG contrast evaluation for reader themes.
 *
 * Extracted so the story doctor and the AI appearance-patch validator agree on
 * one definition of "readable" instead of keeping two drifting copies.
 */
import type { StoryReaderTheme } from '@/lib/story-theme';

export const MIN_TEXT_CONTRAST = 4.5;

export type ThemeContrastPair = 'dialogue' | 'name' | 'choice';

export interface ThemeContrastIssue {
  pair: ThemeContrastPair;
  /** Worst ratio across black/white backdrops when the background is translucent. */
  ratio: number;
  /** True when the background has alpha, so the real ratio depends on the scene behind it. */
  backgroundDependent: boolean;
}

interface ThemeContrastPairSpec {
  pair: ThemeContrastPair;
  text: keyof StoryReaderTheme;
  background: keyof StoryReaderTheme;
}

export const THEME_CONTRAST_PAIRS: readonly ThemeContrastPairSpec[] = [
  { pair: 'dialogue', text: 'dialogueText', background: 'dialogueBg' },
  { pair: 'name', text: 'nameText', background: 'nameBg' },
  { pair: 'choice', text: 'choiceText', background: 'choiceBg' },
];

type Rgb = readonly [number, number, number];

function parseThemeColor(color: string): { rgb: Rgb; alpha: number } {
  return {
    rgb: [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255) as unknown as Rgb,
    alpha: color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) / 255 : 1,
  };
}

function relativeLuminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(rgb: Rgb, alpha: number, backdrop: Rgb): Rgb {
  return rgb.map((channel, index) => channel * alpha + backdrop[index] * (1 - alpha)) as unknown as Rgb;
}

/**
 * Ratio for one text/background pair. Translucent backgrounds are scored
 * against both black and white backdrops and the worst case wins, because the
 * scene image behind the box is unknown at authoring time.
 */
export function evaluateThemePairContrast(
  textColor: string,
  backgroundColor: string,
): { ratio: number; backgroundDependent: boolean } {
  const text = parseThemeColor(textColor);
  const background = parseThemeColor(backgroundColor);

  if (background.alpha < 1) {
    const ratios = ([[0, 0, 0], [1, 1, 1]] as const).map((backdrop) => {
      const effectiveBackground = composite(background.rgb, background.alpha, backdrop as Rgb);
      const effectiveText = composite(text.rgb, text.alpha, effectiveBackground);
      return contrastRatio(effectiveText, effectiveBackground);
    });
    return { ratio: Math.min(...ratios), backgroundDependent: true };
  }

  const effectiveText = composite(text.rgb, text.alpha, background.rgb);
  return { ratio: contrastRatio(effectiveText, background.rgb), backgroundDependent: false };
}

/** Pairs that fall below MIN_TEXT_CONTRAST. Pairs missing either color are skipped. */
export function evaluateThemeContrast(theme: StoryReaderTheme | undefined): ThemeContrastIssue[] {
  if (!theme) return [];

  const issues: ThemeContrastIssue[] = [];
  for (const spec of THEME_CONTRAST_PAIRS) {
    const textColor = theme[spec.text];
    const backgroundColor = theme[spec.background];
    if (!textColor || !backgroundColor) continue;

    const { ratio, backgroundDependent } = evaluateThemePairContrast(textColor, backgroundColor);
    if (ratio < MIN_TEXT_CONTRAST) issues.push({ pair: spec.pair, ratio, backgroundDependent });
  }

  return issues;
}
