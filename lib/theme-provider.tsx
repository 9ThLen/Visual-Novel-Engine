import { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useThemeStore , useThemeInit } from '@/stores/theme-store';
import type { ColorScheme } from '@/constants/theme';
import { createThemeVariables } from '@/lib/theme-variables';
import { getNativewindVarsFactory } from '@/lib/theme-nativewind';

export type { ColorScheme };

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
};

/**
 * ThemeProvider — wraps the app with theme context.
 * Now uses Zustand store internally instead of React Context.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize theme from system scheme on mount
  useThemeInit();

  const colorScheme = useThemeStore((s) => s.colorScheme);
  const setColorScheme = useThemeStore((s) => s.setColorScheme);

  const scheme = Colors[colorScheme];

  const themeVariables = useMemo(
    () =>
      createThemeVariables({
        isWeb: Platform.OS === 'web',
        palette: scheme,
        varsFactory: getNativewindVarsFactory({
          isWeb: Platform.OS === 'web',
        }),
      }),
    [scheme],
  );

  return (
    <View style={[{ flex: 1, backgroundColor: scheme.background }, themeVariables]}>{children}</View>
  );
}

/**
 * Hook to access theme context.
 * Now reads directly from Zustand store.
 */
export function useThemeContext(): ThemeContextValue {
  const colorScheme = useThemeStore((s) => s.colorScheme);
  const setColorScheme = useThemeStore((s) => s.setColorScheme);
  return { colorScheme, setColorScheme };
}
