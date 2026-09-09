import { Colors, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { useThemeStore } from "@/stores/theme-store";

/**
 * Returns the current theme's color palette.
 * Reads from the theme store so it stays in sync with ThemeProvider.
 * Usage: const colors = useColors(); then colors.text, colors.background, etc.
 */
export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const storeScheme = useThemeStore((s) => s.colorScheme);
  const scheme = (colorSchemeOverride ?? storeScheme ?? "dark") as ColorScheme;
  return Colors[scheme];
}
