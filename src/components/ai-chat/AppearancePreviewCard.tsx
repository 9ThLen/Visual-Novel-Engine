import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ColorScheme } from '@/constants/theme';
import type { AppearancePatchDescription } from '@/lib/ai/appearance-patch';

const ACCENT_WARNING = '#eab308';

interface AppearancePreviewCardProps {
  description: AppearancePatchDescription;
  explanation: string;
  colorScheme?: ColorScheme;
  applying?: boolean;
  onApply: () => void;
  onReject: () => void;
}

export function AppearancePreviewCard({
  description,
  explanation,
  colorScheme,
  applying,
  onApply,
  onReject,
}: AppearancePreviewCardProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        backgroundColor: colors.surface,
        padding: 12,
        gap: 10,
      }}
    >
      <View>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '800' }}>
          {t('aiChat.appearance.title')}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{explanation}</Text>
      </View>

      <View style={{ borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 8, gap: 6 }}>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>
          {t('aiChat.appearance.colors', { count: description.colors.length })}
        </Text>

        {description.colors.map((change) => (
          <View key={change.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.foreground, fontSize: 12, flex: 1 }}>{change.key}</Text>
            <Swatch color={change.before} borderColor={colors.border} />
            <Text style={{ color: colors.muted, fontSize: 12 }}>→</Text>
            <Swatch color={change.after} borderColor={colors.border} />
            <Text style={{ color: colors.muted, fontSize: 11, minWidth: 74 }}>{change.after}</Text>
          </View>
        ))}
      </View>

      {description.layoutPreset ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 8, gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>
            {t('aiChat.appearance.layout')}
          </Text>
          <Text style={{ color: colors.foreground, fontSize: 12 }}>
            {description.layoutPreset.before} → {description.layoutPreset.after}
          </Text>
        </View>
      ) : null}

      {description.warnings.length > 0 ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: ACCENT_WARNING, paddingLeft: 8, gap: 3 }}>
          {description.warnings.map((warning, index) => (
            <Text key={`warning-${index}`} style={{ color: ACCENT_WARNING, fontSize: 11 }}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
        <Pressable
          accessibilityRole="button"
          disabled={applying}
          onPress={onReject}
          style={{
            flex: 1,
            minHeight: 36,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: applying ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>{t('aiChat.patch.reject')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={applying}
          onPress={onApply}
          style={{
            flex: 1,
            minHeight: 36,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            backgroundColor: colors.primary,
            opacity: applying ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>{t('aiChat.patch.apply')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Swatch({ color, borderColor }: { color: string | null; borderColor: string }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1,
        borderColor,
        backgroundColor: color ?? 'transparent',
      }}
    />
  );
}
