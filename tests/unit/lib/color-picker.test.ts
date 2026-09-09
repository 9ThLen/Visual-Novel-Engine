import {
  alphaOf,
  hexToHsva,
  hsvaToHex,
  hueHex,
  parseColorToHex,
  withHexAlpha,
} from '@/lib/color-picker';
import { sanitizeStoryTheme } from '@/lib/story-theme';

describe('parseColorToHex', () => {
  it('expands short hex and lowercases', () => {
    expect(parseColorToHex('#ABC')).toBe('#aabbcc');
    expect(parseColorToHex('#AABBCC')).toBe('#aabbcc');
  });

  it('drops a fully opaque alpha so themes stay in their shortest form', () => {
    expect(parseColorToHex('#aabbccff')).toBe('#aabbcc');
    expect(parseColorToHex('#abcf')).toBe('#aabbcc');
    expect(parseColorToHex('#aabbcc80')).toBe('#aabbcc80');
  });

  it('reads the rgba defaults the theme hands the studio', () => {
    // The value the dialogue background actually starts from in dark mode.
    expect(parseColorToHex('rgba(15, 14, 23, 0.92)')).toBe('#0f0e17eb');
    expect(parseColorToHex('rgb(255, 0, 0)')).toBe('#ff0000');
  });

  it('turns an rgba default into something the story theme will accept', () => {
    const hex = parseColorToHex('rgba(253, 252, 249, 0.95)');
    expect(sanitizeStoryTheme({ dialogueBg: hex })?.dialogueBg).toBe(hex);
  });

  it('refuses what it cannot read', () => {
    expect(parseColorToHex('hotpink')).toBeUndefined();
    expect(parseColorToHex('#12345')).toBeUndefined();
    expect(parseColorToHex(undefined)).toBeUndefined();
  });
});

describe('hsva round trip', () => {
  it.each([
    '#000000',
    '#ffffff',
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#67683f',
    '#b0b08a',
    '#0f0e17eb',
  ])('survives hex → hsva → hex for %s', (hex) => {
    expect(hsvaToHex(hexToHsva(hex))).toBe(hex);
  });

  it('reads a known hue, saturation and value', () => {
    const { h, s, v, a } = hexToHsva('#ff0000');
    expect([h, s, v, a]).toEqual([0, 1, 1, 1]);
    expect(hexToHsva('#808080').s).toBe(0);
  });
});

describe('alpha', () => {
  it('reports 1 when a colour carries none', () => {
    expect(alphaOf('#aabbcc')).toBe(1);
    expect(alphaOf('nonsense')).toBe(1);
  });

  it('reads and replaces alpha without moving the hue', () => {
    expect(alphaOf('#aabbcc80')).toBeCloseTo(0.502, 3);
    expect(withHexAlpha('#67683f', 0.5)).toBe('#67683f80');
    expect(withHexAlpha('#67683f80', 1)).toBe('#67683f');
  });
});

describe('hueHex', () => {
  it('gives the saturated stop the picker square fades into', () => {
    expect(hueHex(0)).toBe('#ff0000');
    expect(hueHex(120)).toBe('#00ff00');
    expect(hueHex(240)).toBe('#0000ff');
  });
});
