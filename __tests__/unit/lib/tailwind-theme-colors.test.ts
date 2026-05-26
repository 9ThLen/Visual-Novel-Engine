import { describe, expect, it } from 'vitest';

import { buildTailwindThemeColors } from '@/lib/build-tailwind-theme-colors';

describe('buildTailwindThemeColors', () => {
  it('maps theme tokens to flat CSS variable strings', () => {
    expect(
      buildTailwindThemeColors({
        primary: {
          light: 'oklch(90% 0.1 280)',
          dark: 'oklch(50% 0.2 280)',
        },
        foreground: {
          light: '#111111',
          dark: '#eeeeee',
        },
      }),
    ).toEqual({
      primary: 'var(--color-primary)',
      foreground: 'var(--color-foreground)',
    });
  });
});
