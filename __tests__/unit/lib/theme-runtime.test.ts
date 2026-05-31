import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import themeTokens from '@/constants/theme-colors.json';

const GUARANTEED_SOURCE_TOKENS = [
  'background',
  'foreground',
  'surface',
  'primary',
  'secondary',
  'border',
  'backdrop',
  'hover',
  'warning',
  'danger',
  'success',
  'foreground-inverse',
  'foreground-on-primary',
  'surface-container',
  'surface-1',
  'surface-2',
  'shadow-color',
] as const;

describe('runtime theme colors', () => {
  it('loads theme tokens from a runtime-safe source', () => {
    expect(themeTokens.primary.dark).toEqual(expect.any(String));
    expect(themeTokens.background.light).toEqual(expect.any(String));
  });

  it('defines guaranteed palette tokens for light and dark schemes', () => {
    const tokens = themeTokens as Record<string, Record<'light' | 'dark', string>>;

    for (const token of GUARANTEED_SOURCE_TOKENS) {
      expect(themeTokens[token], token).toBeTruthy();
    }

    for (const scheme of ['light', 'dark'] as const) {
      for (const token of GUARANTEED_SOURCE_TOKENS) {
        expect(tokens[token][scheme], `${scheme}:${token}`).toEqual(expect.any(String));
        expect(tokens[token][scheme], `${scheme}:${token}`).not.toHaveLength(0);
      }
    }
  });

  it('defines source tokens needed by runtime aliases', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(themeTokens.danger[scheme], `${scheme}:danger`).toEqual(expect.any(String));
      expect(themeTokens['foreground-on-primary'][scheme], `${scheme}:foreground-on-primary`).toEqual(expect.any(String));
      expect(themeTokens['surface-1'][scheme], `${scheme}:surface-1`).toEqual(expect.any(String));
    }
  });

  it('keeps runtime alias mappings backed by guaranteed source tokens', () => {
    const source = readFileSync(join(process.cwd(), 'lib/_core/theme.ts'), 'utf8');

    expect(source).toContain('error: base.danger');
    expect(source).toContain("'text-inverse': base['foreground-on-primary']");
    expect(source).toContain("surfaceElevated: base['surface-1']");
    expect(source).toContain('backdrop: base.backdrop');
  });
});
