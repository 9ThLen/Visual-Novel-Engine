/**
 * Language Selector Component
 * UI for selecting app language
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useI18n, type Language, type LanguageInfo } from '@/lib/i18n-context';

interface Props {
  style?: any;
}

export function LanguageSelector({ style }: Props) {
  const colors = useColors();
  const { language, setLanguage, languages, t } = useI18n();

  const handleLanguageChange = async (lang: Language) => {
    await setLanguage(lang);
  };

  return (
    <View style={[styles.container, style]}>
      <Text
        style={[
          styles.label,
          { color: colors.foreground },
        ]}
      >
        {t('settings.language')}
      </Text>

      <View style={styles.buttonsContainer}>
        {languages.map((lang) => (
          <Pressable
            key={lang.code}
            style={({ pressed }) => [
              styles.languageButton,
              {
                backgroundColor:
                  language === lang.code ? colors.primary : colors.surface,
                borderColor:
                  language === lang.code ? colors.primary : colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            onPress={() => handleLanguageChange(lang.code)}
          >
            <Text style={styles.flag}>{lang.flag}</Text>
            <Text
              style={[
                styles.languageName,
                {
                  color: language === lang.code ? '#fff' : colors.foreground,
                },
              ]}
            >
              {lang.nativeName}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  languageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    gap: 8,
  },
  flag: {
    fontSize: 20,
  },
  languageName: {
    fontSize: 13,
    fontWeight: '700',
  },
});
