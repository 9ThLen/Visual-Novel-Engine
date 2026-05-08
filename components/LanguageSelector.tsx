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
                paddingHorizontal: 8,
                paddingVertical: 6,
              },
            ]}
            onPress={() => handleLanguageChange(lang.code)}
          >
            <Text style={styles.flag}>{lang.flag}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    gap: 4,
  },
  flag: {
    fontSize: 18,
  },
  languageName: {
    fontSize: 12,
    fontWeight: '700',
  },
});
