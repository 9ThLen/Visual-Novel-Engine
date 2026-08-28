import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { loadPlayerConfig } from '@/lib/player-mode';
import { ensurePlayerStorySeeded } from '@/lib/player-mode-boot';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { radius, spacing, typeScale } from '@/lib/design-tokens';

type BootState =
  | { status: 'loading' }
  | { status: 'library' }
  | { status: 'player'; storyId: string }
  | { status: 'error'; message: string };

/**
 * Entry route. In a published web bundle (see `scripts/export-story-web.mjs`)
 * this detects `player-config.json`, seeds its story into the store and routes
 * straight to the reader. Everywhere else it redirects to the library.
 */
export default function Index() {
  const colors = useColors();
  const { t } = useI18n();
  const [boot, setBoot] = useState<BootState>(
    Platform.OS === 'web' ? { status: 'loading' } : { status: 'library' },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    void (async () => {
      try {
        const config = await loadPlayerConfig();
        if (cancelled) return;
        if (!config) {
          setBoot({ status: 'library' });
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

  if (boot.status === 'loading' || boot.status === 'error') {
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
              {t('playerBoot.failed')}
            </Text>
            <Text style={{ color: colors.muted, ...typeScale.body, textAlign: 'center' }}>
              {boot.message}
            </Text>
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
  if (boot.status === 'player') {
    return <Redirect href={{ pathname: '/reader', params: { storyId: boot.storyId, resume: '0' } }} />;
  }
  return <Redirect href="/tabs" />;
}
