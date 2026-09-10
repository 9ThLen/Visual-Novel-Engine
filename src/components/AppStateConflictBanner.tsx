import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { AppModal } from '@/components/ui/AppModal';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { subscribeToAppStateConflict } from '@/lib/app-store-conflict';
import { radius, spacing, typeScale } from '@/lib/design-tokens';

/**
 * Shown when this tab can no longer save because another tab has written the
 * app state.
 *
 * Deliberately a modal rather than a toast. The author's edits are no longer
 * being written to disk, and a message that fades after four seconds would let
 * them keep writing into a tab that is quietly discarding the work. There is
 * nothing to dismiss it to — reloading is the only way forward, so that is the
 * only action.
 */
export function AppStateConflictBanner() {
  const colors = useColors();
  const { t } = useI18n();
  const [conflicted, setConflicted] = useState(false);

  useEffect(() => subscribeToAppStateConflict(setConflicted), []);

  if (!conflicted) return null;

  const reload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
  };

  return (
    <AppModal transparent animationType="fade" visible onRequestClose={reload}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.backdrop,
          padding: spacing.xl,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: colors['surface-container'],
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.lg,
            padding: spacing.xl,
            gap: spacing.md,
          }}
        >
          <Text style={[typeScale.sectionTitle, { color: colors.foreground }]}>
            {t('crossTab.conflictTitle')}
          </Text>
          <Text style={[typeScale.body, { color: colors['foreground-secondary'] }]}>
            {t('crossTab.conflictBody')}
          </Text>
          <Pressable
            onPress={reload}
            accessibilityRole="button"
            style={({ pressed }) => ({
              alignSelf: 'flex-end',
              backgroundColor: colors.primary,
              borderRadius: radius.full,
              paddingHorizontal: spacing.lg,
              paddingVertical: 10,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={[typeScale.label, { color: colors['text-inverse'], fontWeight: '700' }]}>
              {t('crossTab.reload')}
            </Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}
