import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ColorScheme } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { AI_CAPABILITIES, AI_PERMISSION_LEVELS, setCapabilityLevel, type AiPermissions } from '@/lib/ai/permissions';

export function AiPermissionSettings({ permissions, onChange, colorScheme }: {
  permissions: AiPermissions;
  onChange: (permissions: AiPermissions) => void;
  colorScheme?: ColorScheme;
}) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, padding: 10, gap: 10 }}>
      <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.permissions.title')}</Text>
      {AI_CAPABILITIES.map((capability) => (
        <View key={capability} style={{ gap: 5 }}>
          <Text style={{ color: colors.foreground, fontSize: 12 }}>{t(`aiChat.permissions.capability.${capability}`)}</Text>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {AI_PERMISSION_LEVELS.filter(level =>
              !((capability === 'changeset' || capability === 'image_generate') && level === 'auto'),
            ).map((level) => (
              <Pressable
                key={level}
                accessibilityRole="button"
                accessibilityState={{ selected: permissions[capability] === level }}
                onPress={() => onChange(setCapabilityLevel(permissions, capability, level))}
                style={{ borderWidth: 1, borderColor: permissions[capability] === level ? colors.primary : colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={{ color: permissions[capability] === level ? colors.primary : colors.muted, fontSize: 11 }}>{t(`aiChat.permissions.level.${level}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
