/**
 * Internationalization (i18n) System
 * Context for managing app language and translations
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Supported languages
export type Language = 'en' | 'uk' | 'ru';

export interface LanguageInfo {
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
];

// Translation type
export type TranslationKey = string;
export type Translations = Record<TranslationKey, Record<Language, string>>;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: TranslationKey, fallback?: string) => string;
  languages: LanguageInfo[];
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Import translations
import translations from './translations.json';

const DEFAULT_LANGUAGE: Language = 'en';
const STORAGE_KEY = 'app_language';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  // Load saved language on mount
  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved && (saved === 'en' || saved === 'uk' || saved === 'ru')) {
        setLanguageState(saved as Language);
      }
    } catch (error) {
      console.error('Failed to load language:', error);
    }
  };

  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, lang);
      setLanguageState(lang);
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  };

  // Translation function
  const t = (key: TranslationKey, fallback?: string): string => {
    const translation = (translations as Translations)[key];

    if (!translation) {
      console.warn(`Translation missing for key: ${key}`);
      return fallback || key;
    }

    const text = translation[language];

    if (!text) {
      // Fallback to English if translation missing
      const englishText = translation['en'];
      if (englishText) {
        console.warn(`Translation missing for key: ${key} in language: ${language}`);
        return englishText;
      }
      return fallback || key;
    }

    return text;
  };

  const value: I18nContextType = {
    language,
    setLanguage,
    t,
    languages: SUPPORTED_LANGUAGES,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

// Helper function for getting language info
export function getLanguageInfo(code: Language): LanguageInfo {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code) || SUPPORTED_LANGUAGES[0];
}
