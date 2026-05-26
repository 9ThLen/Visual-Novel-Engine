import { describe, expect, it, vi } from 'vitest';

import { createThemeVariables } from '@/lib/theme-variables';

describe('createThemeVariables', () => {
  it('does not call nativewind vars on web', () => {
    const varsFactory = vi.fn();

    const result = createThemeVariables({
      isWeb: true,
      palette: {
        background: '#000000',
        foreground: '#ffffff',
      },
      varsFactory,
    });

    expect(result).toBeUndefined();
    expect(varsFactory).not.toHaveBeenCalled();
  });

  it('builds css variable tokens on native platforms', () => {
    const varsFactory = vi.fn((value) => value);

    const result = createThemeVariables({
      isWeb: false,
      palette: {
        background: '#ffffff',
        foreground: '#111111',
        primary: '#7c5bf5',
      },
      varsFactory,
    });

    expect(varsFactory).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      'color-background': expect.any(String),
      'color-foreground': expect.any(String),
      'color-primary': expect.any(String),
    });
  });
});
