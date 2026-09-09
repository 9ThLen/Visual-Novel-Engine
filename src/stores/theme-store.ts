import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect } from 'react';
import { createPersistentStorage } from '@/lib/persistent-storage';
import { Appearance, useColorScheme as useSystemColorScheme } from 'react-native';
import { SchemeColors, type ColorScheme } from '@/constants/theme';
import { getNativewindColorSchemeController } from '@/lib/theme-nativewind';

const STORAGE_KEY = 'vne_theme';

interface ThemeState {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  applyScheme: (scheme: ColorScheme) => void;
}

function applyColorScheme(scheme: ColorScheme) {
  if (!scheme) return;
  getNativewindColorSchemeController({
    isWeb: typeof document !== 'undefined',
  })?.set(scheme);
  try {
    if (Appearance?.setColorScheme) {
      Appearance.setColorScheme(scheme);
    }
  } catch {
    // Appearance.setColorScheme may not be available on all Android versions
  }
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.dataset.theme = scheme;
    root.classList.toggle('dark', scheme === 'dark');
    const palette = SchemeColors[scheme] as Record<string, string>;
    try {
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    } catch {
      // document.documentElement may not be available in all environments
    }
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      colorScheme: 'dark' as ColorScheme,
      setColorScheme: (scheme: ColorScheme) => {
        set({ colorScheme: scheme });
        get().applyScheme(scheme);
      },
      applyScheme: applyColorScheme,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(createPersistentStorage),
      partialize: (state) => ({ colorScheme: state.colorScheme }),
    },
  ),
);

/**
 * Hook to initialize theme from system color scheme on mount.
 * Call once in the root component (inside ThemeProvider).
 */
export function useThemeInit() {
  const systemScheme = useSystemColorScheme();
  const setColorScheme = useThemeStore((s) => s.setColorScheme);
  const applyScheme = useThemeStore((s) => s.applyScheme);
  const colorScheme = useThemeStore((s) => s.colorScheme);

  useEffect(() => {
    applyScheme(colorScheme);
  }, [colorScheme, applyScheme]);

  useEffect(() => {
    if (systemScheme && !colorScheme) {
      setColorScheme(systemScheme as ColorScheme);
    }
  }, [systemScheme, colorScheme, setColorScheme]);
}
