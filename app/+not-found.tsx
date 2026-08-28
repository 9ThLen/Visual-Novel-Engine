import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { radius, spacing, typeScale } from '@/lib/design-tokens';

export default function NotFoundScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();

  return (
    <View style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      backgroundColor: colors.background,
    }}>
      <Text style={{ color: colors.foreground, ...typeScale.sectionTitle, textAlign: 'center' }}>
        {t('notFound.title')}
      </Text>
      <Text style={{ color: colors.muted, ...typeScale.body, textAlign: 'center' }}>
        {t('notFound.message')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('notFound.home')}
        onPress={() => router.replace('/')}
        style={({ pressed }) => ({
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.primary,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ color: colors['text-inverse'], ...typeScale.label }}>
          {t('notFound.home')}
        </Text>
      </Pressable>
    </View>
  );
}
