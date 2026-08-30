import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { loadPlayerConfig } from '@/lib/player-mode';
import { ensurePlayerStorySeeded } from '@/lib/player-mode-boot';

type BootState =
  | { status: 'loading' }
  | { status: 'player'; storyId: string }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/**
 * The player's entry route.
 *
 * `app/index.tsx` does the same detection but falls back to the library when no
 * story is bundled. Here there is no library to fall back to: a player build
 * without a story is a broken build, and saying so is more useful than routing
 * a reader into an empty shell.
 */
export default function PlayerIndex() {
  const colors = useColors();
  const { t } = useI18n();
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await loadPlayerConfig();
        if (cancelled) return;
        if (!config) {
          setBoot({ status: 'missing' });
          return;
        }
        const storyId = await ensurePlayerStorySeeded(config);
        if (cancelled) return;
        setBoot({ status: 'player', storyId });
      } catch (error) {
        if (cancelled) return;
        setBoot({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (boot.status === 'player') {
    return <Redirect href={{ pathname: '/reader', params: { storyId: boot.storyId, resume: '0' } }} />;
  }

  return (
    <View style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      backgroundColor: colors.background,
    }}>
      {boot.status === 'loading' ? (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.foreground, ...typeScale.body }}>
            {t('playerBoot.loading')}
          </Text>
        </>
      ) : (
        <>
          <Text style={{ color: colors.error, ...typeScale.sectionTitle, textAlign: 'center' }}>
            {boot.status === 'missing' ? t('playerBoot.missing') : t('playerBoot.failed')}
          </Text>
          {boot.status === 'error' ? (
            <Text style={{ color: colors.muted, ...typeScale.body, textAlign: 'center' }}>
              {boot.message}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            onPress={() => {
              setBoot({ status: 'loading' });
              setAttempt((value) => value + 1);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: colors['text-inverse'], ...typeScale.label }}>
              {t('common.retry')}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
