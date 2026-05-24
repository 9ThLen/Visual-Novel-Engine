import { useMemo } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { Colors, SchemeColors } from '@/constants/theme';
import { useThemeStore , useThemeInit } from '@/stores/theme-store';
import type { ColorScheme } from '@/constants/theme';

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
      vars(
        Object.fromEntries(
          Object.entries(SchemeColors[colorScheme]).map(([token, value]) => [
            `color-${token}`,
            value,
          ])
        )
      ),
    [colorScheme],
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
