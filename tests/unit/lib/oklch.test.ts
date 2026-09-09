/**
 * The OKLCH → sRGB conversion behind every `oklch()` token in the palette.
 *
 * Anchored on values that are true outside this file: the OKLCH coordinates of
 * the sRGB primaries. If the conversion ever loses its LMS → linear-sRGB
 * matrix again, red stops being red here rather than in the editor.
 */
import themeTokens from '@/constants/theme-colors.json';
import { oklchToRgb } from '@/lib/_core/theme';

describe('oklchToRgb', () => {
  it.each([
    ['oklch(100% 0 0)', '#ffffff'],
    ['oklch(0% 0 0)', '#000000'],
    ['oklch(59.99% 0 0)', '#808080'],
    ['oklch(62.8% 0.2577 29.23)', '#ff0000'],
    ['oklch(86.64% 0.2948 142.5)', '#00ff00'],
    ['oklch(45.2% 0.3132 264.05)', '#0000ff'],
  ])('turns %s into %s', (input, expected) => {
    expect(oklchToRgb(input)).toBe(expected);
  });

  it('keeps alpha as rgba, since hex would lose it downstream', () => {
    expect(oklchToRgb('oklch(0% 0 0 / 0.5)')).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('passes through anything that is not oklch', () => {
    expect(oklchToRgb('#67683F')).toBe('#67683F');
    expect(oklchToRgb('rgba(15, 14, 23, 0.92)')).toBe('rgba(15, 14, 23, 0.92)');
  });

  it('gives the state colours their own hue rather than a shared mud', () => {
    // Every one of these was a brown or a grey-olive before the matrix landed.
    expect(oklchToRgb(themeTokens.danger.light)).toBe('#c53637');
    expect(oklchToRgb(themeTokens.success.light)).toBe('#008b45');
    expect(oklchToRgb(themeTokens.info.dark)).toBe('#4ba3f7');
  });

  it('keeps the ten editor block colours distinguishable', () => {
    const blocks = [
      'lego-dialogue', 'lego-character', 'lego-background', 'lego-fx', 'lego-choice',
      'lego-condition', 'lego-variable', 'lego-loop', 'lego-transition',
    ] as const;

    const rendered = blocks.map((token) => oklchToRgb(themeTokens[token].dark));
    expect(new Set(rendered).size).toBe(blocks.length);

    // Distinguishable means far apart, not merely unequal. The closest pair
    // measured 13.4 apart while the matrix was missing and 30.2 with it; the
    // remaining closeness is loop against transition, whose hues really are
    // ten degrees apart in the palette.
    const channels = (hex: string) => [1, 3, 5].map((o) => Number.parseInt(hex.slice(o, o + 2), 16));
    let closest = Infinity;
    for (let i = 0; i < rendered.length; i += 1) {
      for (let j = i + 1; j < rendered.length; j += 1) {
        const [a, b] = [channels(rendered[i]), channels(rendered[j])];
        closest = Math.min(closest, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      }
    }
    expect(closest).toBeGreaterThan(25);
  });
});
