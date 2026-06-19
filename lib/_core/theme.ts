import { Platform } from "react-native";

import themeColors from "@/constants/theme-colors.json";

export type ColorScheme = "light" | "dark";

export const ThemeColors = themeColors;

type ThemeColorTokens = typeof ThemeColors;
type ThemeColorName = keyof ThemeColorTokens;
type SchemePalette = Record<ColorScheme, Record<ThemeColorName, string>>;
type SchemePaletteItem = SchemePalette[ColorScheme];

/**
 * Convert oklch(L% C H[/ A]) to hex (#rrggbb) or rgba(r,g,b,a).
 * Passes non-oklch values through unchanged.
 */
function oklchToRgb(input: string): string {
  const match = input.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
  if (!match) return input;

  const L = parseFloat(match[1]) / 100;
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]) * (Math.PI / 180);
  const A = match[4] !== undefined ? parseFloat(match[4]) : 1;

  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  let r = l_ * l_ * l_;
  let g = m_ * m_ * m_;
  let bl = s_ * s_ * s_;

  r = Math.max(0, Math.min(1, r));
  g = Math.max(0, Math.min(1, g));
  bl = Math.max(0, Math.min(1, bl));

  const gamma = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  r = gamma(r);
  g = gamma(g);
  bl = gamma(bl);

  const clamp = (c: number) => Math.round(Math.max(0, Math.min(255, c)));
  const ri = clamp(r * 255);
  const gi = clamp(g * 255);
  const bi = clamp(bl * 255);

  if (A < 1) {
    return `rgba(${ri}, ${gi}, ${bi}, ${A})`;
  }
  return `#${ri.toString(16).padStart(2, '0')}${gi.toString(16).padStart(2, '0')}${bi.toString(16).padStart(2, '0')}`;
}

function buildSchemePalette(colors: ThemeColorTokens): SchemePalette {
  const palette: SchemePalette = {
    light: {} as SchemePalette["light"],
    dark: {} as SchemePalette["dark"],
  };

  (Object.keys(colors) as ThemeColorName[]).forEach((name) => {
    const swatch = colors[name];
    palette.light[name] = oklchToRgb(swatch.light);
    palette.dark[name] = oklchToRgb(swatch.dark);
  });

  return palette;
}

export const SchemeColors = buildSchemePalette(ThemeColors);

export type RuntimePalette = SchemePaletteItem & {
  // Aliases for common use
  text: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  // Legacy aliases
  surfaceElevated: string;
  muted: string;
  error: string;
  'text-inverse': string;
  'foreground-inverse': string;
  // VN Reader
  dialogueBg: string;
  nameBg: string;
  nameText: string;
  choiceBg: string;
  choiceBorder: string;
  choiceHover: string;
  // Overlays
  overlay?: string;
  scrim?: string;
  backdrop: string;
  // Editor
  editorRuler?: string;
  // New editor tokens (Stitch design system)
  secondary: string;
  hover: string;
  'surface-container': string;
  'surface-1': string;
  'surface-2': string;
  // Ensure common tokens are always present
  primary: string;
  background: string;
  surface: string;
  foreground: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  'shadow-color': string;
};

function buildRuntimePalette(scheme: ColorScheme): RuntimePalette {
  const base = SchemeColors[scheme] as Record<string, string>;
  const extra = ThemeColors as Record<string, { light: string; dark: string }>;
  const x = (key: string) => extra[key] ? oklchToRgb(extra[key][scheme]) : undefined;
  return {
    ...base,
    // Aliases
    text: base.foreground,
    tint: base.primary,
    icon: base['foreground-secondary'],
    tabIconDefault: base['foreground-tertiary'],
    tabIconSelected: base.primary,
    // Legacy aliases
    muted: base['foreground-tertiary'],
    error: base.danger,
    'text-inverse': base['foreground-on-primary'],
    'foreground-inverse': base['foreground-inverse'],
    surfaceElevated: base['surface-1'],
    // VN Reader
    dialogueBg: x('dialogue-bg') || 'rgba(15,14,23,0.92)',
    nameBg: x('name-bg') || 'rgba(15,14,23,0.95)',
    nameText: x('name-text') || base.foreground,
    choiceBg: x('choice-bg') || 'rgba(124,58,237,0.12)',
    choiceBorder: x('choice-border') || base.primary,
    choiceHover: x('choice-hover') || 'rgba(124,58,237,0.25)',
    // Overlays
    overlay: x('overlay'),
    scrim: x('scrim'),
    backdrop: base.backdrop,
    // Editor
    editorRuler: x('editor-ruler'),
    // New editor tokens (Stitch design system)
    secondary: x('secondary') || base.primary,
    hover: base.hover,
    'surface-container': base['surface-container'],
    'surface-1': base['surface-1'],
    'surface-2': base['surface-2'],
    'shadow-color': base['shadow-color'],
  } as RuntimePalette;
}

export const Colors = {
  light: buildRuntimePalette("light"),
  dark: buildRuntimePalette("dark"),
} satisfies Record<ColorScheme, RuntimePalette>;

/**
 * Apply alpha to a color. Handles hex (#rrggbb/#rgb/#rrggbbaa), rgb()/rgba(), oklch().
 * - For hex: appends/overwrites 2-char alpha (clamped 0..255).
 * - For rgb()/rgba(): replaces alpha channel.
 * - For oklch(): appends /<alpha> if not present.
 * - Falls back to the input if format is unrecognized.
 */
export function withAlpha(color: string | undefined, alpha: number): string {
  if (!color) return color ?? '';
  const a = Math.max(0, Math.min(1, alpha));

  // hex
  if (color.startsWith('#')) {
    const raw = color.slice(1);
    const six =
      raw.length === 3 || raw.length === 4
        ? raw
            .slice(0, 3)
            .split('')
            .map((c) => c + c)
            .join('')
        : raw.length >= 6
          ? raw.slice(0, 6)
          : null;
    if (!six || !/^[0-9a-fA-F]{6}$/.test(six)) return color;
    const aa = Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
    return `#${six}${aa}`;
  }

  // rgb / rgba
  const rgbMatch = color.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${a})`;
  }

  // oklch(L% C H[/ A])
  const oklchMatch = color.match(/^oklch\(([^)]+)\)$/i);
  if (oklchMatch) {
    const inner = oklchMatch[1];
    const base = inner.split('/')[0].trim();
    return `oklch(${base} / ${a})`;
  }

  return color;
}

export type ThemeColorPalette = (typeof Colors)[ColorScheme];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
