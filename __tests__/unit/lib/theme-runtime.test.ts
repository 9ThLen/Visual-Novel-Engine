import { describe, expect, it } from 'vitest';

describe('runtime theme colors', () => {
  it('loads theme tokens from a runtime-safe source', async () => {
    const themeTokens = await import('@/constants/theme-colors.json');

    expect(themeTokens.default.primary.dark).toEqual(expect.any(String));
    expect(themeTokens.default.background.light).toEqual(expect.any(String));
  });
});
