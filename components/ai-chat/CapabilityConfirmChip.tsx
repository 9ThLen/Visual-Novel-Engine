import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { AiCapability, AiCapabilityEstimate } from '@/lib/ai/permissions';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ColorScheme } from '@/constants/theme';

export function CapabilityConfirmChip({ capability, estimate, colorScheme, onAccept, onDecline }: {
  capability: AiCapability;
  estimate?: string | AiCapabilityEstimate;
  colorScheme?: ColorScheme;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const details = typeof estimate === 'object' && estimate ? estimate : null;
  const range = details?.costUsdRange;
  const cost = range && typeof range.min === 'number' && typeof range.max === 'number'
    ? `$${range.min.toFixed(3)}–$${range.max.toFixed(3)}`
    : t('aiChat.permissions.estimateUnavailable');
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, gap: 8 }}>
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>
        {t(`aiChat.permissions.capability.${capability}`)}
      </Text>
      {typeof estimate === 'string' ? <Text style={{ color: colors.muted, fontSize: 12 }}>{estimate}</Text> : null}
      {details ? (
        <View style={{ gap: 3 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {[details.provider, details.model, details.size, details.quality].filter(Boolean).join(' · ')}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{t('aiChat.permissions.estimatedCost', { cost })}</Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            {t('aiChat.permissions.imageDisclosure', { provider: details.provider ?? t('aiChat.permissions.imageProvider') })}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={onAccept}><Text style={{ color: colors.primary, fontWeight: '700' }}>{t('aiChat.permissions.allow')}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onDecline}><Text style={{ color: colors.muted, fontWeight: '700' }}>{t('aiChat.permissions.decline')}</Text></Pressable>
      </View>
    </View>
  );
}
