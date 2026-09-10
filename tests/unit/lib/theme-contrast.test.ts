import { evaluateThemeContrast, evaluateThemePairContrast, MIN_TEXT_CONTRAST } from '@/lib/theme-contrast';

describe('theme contrast', () => {
  it('scores an opaque pair against WCAG', () => {
    const { ratio, backgroundDependent } = evaluateThemePairContrast('#ffffff', '#000000');
    expect(ratio).toBeCloseTo(21, 0);
    expect(backgroundDependent).toBe(false);
  });

  it('takes the worst backdrop for a translucent background', () => {
    // Near-transparent dark box: readable over black, unreadable over white.
    const { ratio, backgroundDependent } = evaluateThemePairContrast('#ffffff', '#00000010');
    expect(backgroundDependent).toBe(true);
    expect(ratio).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it('reports only pairs below the threshold', () => {
    const issues = evaluateThemeContrast({
      dialogueText: '#ffffff',
      dialogueBg: '#000000', // 21:1, fine
      nameText: '#aaaaaa',
      nameBg: '#bbbbbb', // far too low
    });

    expect(issues.map((issue) => issue.pair)).toEqual(['name']);
    expect(issues[0].ratio).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it('skips pairs that are missing a color, and handles no theme', () => {
    expect(evaluateThemeContrast({ dialogueText: '#aaaaaa' })).toEqual([]);
    expect(evaluateThemeContrast(undefined)).toEqual([]);
  });
});
