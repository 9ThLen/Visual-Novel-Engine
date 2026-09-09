/**
 * Colour maths for the picker.
 *
 * Kept free of React so the conversions can be tested on their own, and so the
 * studio has one place that knows how to turn whatever a colour currently is —
 * a short hex, a long hex, an `rgba()` default coming out of the theme — into
 * the `#rrggbb[aa]` that `sanitizeStoryTheme` will accept.
 */

export interface Hsva {
  /** Degrees, 0–360. */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  v: number;
  /** 0–1. */
  a: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toByte = (value: number) => clamp(Math.round(value * 255), 0, 255).toString(16).padStart(2, '0');

/**
 * Normalizes any colour the app might already be holding into lowercase
 * `#rrggbb` or `#rrggbbaa`. Returns undefined for anything it cannot read,
 * so callers can fall back rather than write a broken value into a story.
 */
export function parseColorToHex(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();

  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const raw = hex[1];
    if (raw.length === 3 || raw.length === 4) {
      const expanded = raw.split('').map((c) => c + c).join('');
      return `#${expanded.length === 8 && expanded.slice(6) === 'ff' ? expanded.slice(0, 6) : expanded}`;
    }
    if (raw.length === 6) return `#${raw}`;
    if (raw.length === 8) return `#${raw.slice(6) === 'ff' ? raw.slice(0, 6) : raw}`;
    return undefined;
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((part) => toByte(Number.parseFloat(part) / 255));
    const alpha = rgb[4] === undefined ? 1 : clamp(Number.parseFloat(rgb[4]), 0, 1);
    return `#${channels.join('')}${alpha >= 1 ? '' : toByte(alpha)}`;
  }

  return undefined;
}

/** Alpha of a colour, 1 when it carries none. */
export function alphaOf(input: string | undefined): number {
  const hex = parseColorToHex(input);
  if (!hex || hex.length !== 9) return 1;
  return Number.parseInt(hex.slice(7, 9), 16) / 255;
}

export function hexToHsva(input: string): Hsva {
  const hex = parseColorToHex(input) ?? '#000000';
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const a = hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;

  let h = 0;
  if (span !== 0) {
    if (max === r) h = 60 * (((g - b) / span) % 6);
    else if (max === g) h = 60 * ((b - r) / span + 2);
    else h = 60 * ((r - g) / span + 4);
  }

  return {
    h: (h + 360) % 360,
    s: max === 0 ? 0 : span / max,
    v: max,
    a,
  };
}

export function hsvaToHex({ h, s, v, a }: Hsva): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const value = clamp(v, 0, 1);
  const alpha = clamp(a, 0, 1);

  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;

  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[sector];

  const rgb = [r + m, g + m, b + m].map(toByte).join('');
  return `#${rgb}${alpha >= 1 ? '' : toByte(alpha)}`;
}

/** The fully saturated colour of a hue — the right-hand stop of the picker square. */
export function hueHex(h: number): string {
  return hsvaToHex({ h, s: 1, v: 1, a: 1 });
}

/** Replaces a colour's alpha, keeping its hue, saturation and value. */
export function withHexAlpha(input: string, alpha: number): string {
  return hsvaToHex({ ...hexToHsva(input), a: alpha });
}
