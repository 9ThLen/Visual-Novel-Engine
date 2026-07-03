/**
 * app/preview.tsx — Full Preview Mode Screen
 *
 * Loading and error states use ActivityIndicator + i18n strings with a
 * recovery action (back button) so the user is never stranded in a
 * dead-end view.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PreviewScreen } from '@/components/editor/PreviewScreen';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { useAppStore } from '@/stores/use-app-store';

export default function PreviewRoute() {
  const { storyId, sceneId } = useLocalSearchParams<{ storyId: string; sceneId: string }>();
  const isLoaded = useAppStore((state) => state.isLoaded);
  const hydrateSceneRecordsForStory = useAppStore((state) => state.hydrateSceneRecordsForStory);
  const [hydratedStoryId, setHydratedStoryId] = useState<string | null>(null);
  const colors = useColors();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    setHydratedStoryId(null);

    if (!storyId || !isLoaded) return () => {
      cancelled = true;
    };

    void hydrateSceneRecordsForStory(storyId).finally(() => {
      if (!cancelled) setHydratedStoryId(storyId);
    });

    return () => {
      cancelled = true;
    };
  }, [hydrateSceneRecordsForStory, isLoaded, storyId]);

  if (!isLoaded || (storyId && hydratedStoryId !== storyId)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          gap: spacing.md,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.foreground, ...typeScale.body }}>
          {t('common.loading')}
        </Text>
      </View>
    );
  }

  if (!storyId || !sceneId) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          gap: spacing.md,
          padding: spacing.lg,
        }}
      >
        <Text
          style={{
            color: colors.foreground,
            ...typeScale.sectionTitle,
            textAlign: 'center',
          }}
        >
          {t('document.invalidRoute')}
        </Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('menu.back')}
          style={({ pressed }) => ({
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors['text-inverse'], ...typeScale.label }}>
            {t('menu.back')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return <PreviewScreen storyId={storyId} sceneId={sceneId} />;
}
