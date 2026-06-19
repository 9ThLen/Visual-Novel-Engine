/**
 * Internationalization hook — reads language directly from Zustand.
 * No Context needed.
 *
 * Usage:
 *   const { t, language, setLanguage, pluralize, languages } = useI18n();
 *
 * NOTE: This file was moved from lib/i18n.ts to hooks/use-i18n.ts
 * to resolve the layer boundary violation (lib/ should not import from stores/).
 * The original lib/i18n.ts re-exports this hook for backward compatibility.
 */

import { useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/use-app-store';
import { allTranslations, SUPPORTED_LANGUAGES, type Language, type LanguageInfo } from '@/lib/translations';

export type { Language, LanguageInfo };

export function useI18n() {
  const language = useAppStore((s) => s.language);
  const setLanguageAction = useAppStore((s) => s.setLanguage);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>, fallback?: string): string => {
      const langDict = allTranslations[language];
      let text = langDict?.[key];
      if (!text) {
        const englishDict = allTranslations.en;
        text = englishDict?.[key];
        if (!text) {
          if (__DEV__) console.warn(`[i18n] Missing translation for key: ${key}`);
          return fallback || key;
        }
      }
      if (!params) return text;
      return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
    },
    [language],
  );

  const pluralize = useCallback(
    (count: number, one: string, few?: string, many?: string): string => {
      if (few === undefined) {
        return count === 1 ? one : (many ?? one);
      }
      const abs = Math.abs(count) % 100;
      if (abs >= 11 && abs <= 19) return many ?? one;
      const lastDigit = abs % 10;
      if (lastDigit === 1) return one;
      if (lastDigit >= 2 && lastDigit <= 4) return few;
      return many ?? one;
    },
    [],
  );

  const setLanguage = useCallback(
    async (lang: Language) => {
      setLanguageAction(lang);
    },
    [setLanguageAction],
  );

  return useMemo(
    () => ({
      language,
      setLanguage,
      t,
      pluralize,
      languages: SUPPORTED_LANGUAGES,
    }),
    [language, setLanguage, t, pluralize],
  );
}
