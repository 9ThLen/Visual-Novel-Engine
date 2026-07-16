import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { AiCapability } from '@/lib/ai/permissions';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ColorScheme } from '@/constants/theme';

export function CapabilityConfirmChip({ capability, estimate, colorScheme, onAccept, onDecline }: {
  capability: AiCapability;
  estimate?: string;
  colorScheme?: ColorScheme;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, gap: 8 }}>
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>
        {t(`aiChat.permissions.capability.${capability}`)}
      </Text>
      {estimate ? <Text style={{ color: colors.muted, fontSize: 12 }}>{estimate}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={onAccept}><Text style={{ color: colors.primary, fontWeight: '700' }}>{t('aiChat.permissions.allow')}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onDecline}><Text style={{ color: colors.muted, fontWeight: '700' }}>{t('aiChat.permissions.decline')}</Text></Pressable>
      </View>
    </View>
  );
}
