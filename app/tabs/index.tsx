import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { ScreenContainer } from '@/components/screen-container';
import { useStoryState, useStoryActions } from '@/hooks/use-story-state';
import { useAppStore } from '@/stores/use-app-store';
import { getLibraryAssets, addAssetToLibrary } from '@/stores/media-library-actions';
import { StoryMetadata } from '@/lib/story-domain';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import { Button } from '@/components/ui';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import demoStory from '@/assets/demo-story.json';
import demoStoryAdvanced from '@/assets/demo-story-advanced.json';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { StoryValidator } from '@/lib/story-validator';
import { shouldUpsertBundledStory } from '@/lib/bundled-story-sync';
import { navigateWithViewTransition } from '@/lib/navigation-transition';

import { buttonFeedback } from '@/lib/ui-feedback';

interface StoryCardProps {
  item: StoryMetadata;
  onPress: (story: StoryMetadata) => void;
}

const StoryCard = memo(function StoryCard({ item, onPress }: StoryCardProps) {
  const { t } = useI18n();
  const colors = useColors();
  const accent = withAlpha(colors.primary, 0.14);
  const elevatedSurface = colors['surface-1'] ?? colors.surface;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.storyCard,
        {
          backgroundColor: elevatedSurface,
          borderColor: colors.border,
          opacity: pressed ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
      onPress={() => {
        buttonFeedback();
        onPress(item);
      }}
      accessibilityLabel={`Play story: ${item.title}`}
      accessibilityRole="button"
    >
      <View style={styles.thumbnailFrame}>
        {item.thumbnailUri ? (
          <Image
            source={{ uri: item.thumbnailUri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: accent }]}>
            <Text style={[styles.thumbnailIcon, { color: colors.primary }]}>VN</Text>
          </View>
        )}
      </View>

      <View style={styles.storyCardBody}>
        <View style={styles.storyCardTitleRow}>
          <Text style={[styles.storyTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[styles.sceneBadge, { backgroundColor: accent }]}>
            <Text style={[styles.sceneBadgeText, { color: colors.primary }]}>
              {item.sceneCount ?? 0}
            </Text>
          </View>
        </View>
        {item.description ? (
          <Text style={[styles.storyDescription, { color: colors.muted }]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : (
          <Text style={[styles.storyDescription, { color: colors.muted }]} numberOfLines={2}>
            {t('home.readyToRead')}
          </Text>
        )}
        <View style={styles.storyMetaRow}>
          <Text style={[styles.storyMeta, { color: colors.muted }]} numberOfLines={1}>
            {item.author ? `${t('home.by')} ${item.author}` : t('home.interactiveStory')}
          </Text>
          <Text style={[styles.storyMetaCta, { color: colors.primary }]}>{t('home.play')}</Text>
        </View>
      </View>
    </Pressable>
  );
});

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  useFocusEffect(
    useCallback(() => {
      void stopReaderPlayback();
    }, []),
  );
  const { storiesMetadata } = useStoryState();
  const { loadStories, addStory } = useStoryActions();
  const [isInitialized, setIsInitialized] = useState(false);
  const { t } = useI18n();

  const initializeApp = useCallback(async () => {
    const waitForHydration = () => new Promise<void>((resolve) => {
      if (useAppStore.persist.hasHydrated()) {
        resolve();
      } else {
        const unsub = useAppStore.persist.onFinishHydration(() => {
          unsub();
          resolve();
        });
      }
    });
    await waitForHydration();

    // Migrate legacy data before loading stories
    try {
      await useAppStore.getState().migrateFromLegacyKeys();
    } catch (error) {
      ErrorHandler.handle('Legacy migration failed', error, ErrorCategory.STORAGE);
    }

    let initError: unknown = null;
    try {
      await loadStories();
    } catch (error) {
      initError = error;
      ErrorHandler.handle('Failed to load stories from storage', error, ErrorCategory.STORAGE);
    }

    // Ensure demo stories exist regardless of storage errors
    try {
      const state = useAppStore.getState();
      const demo1 = StoryValidator.validateStory(demoStory);
      const demo2 = StoryValidator.validateStory(demoStoryAdvanced);

      if (shouldUpsertBundledStory(state, demo1)) {
        if (__DEV__) {
          console.log('[HomeScreen] syncing bundled story', { storyId: demo1.id });
        }
        addStory(demo1);
      }

      const updatedState = useAppStore.getState();
      if (shouldUpsertBundledStory(updatedState, demo2)) {
        if (__DEV__) {
          console.log('[HomeScreen] syncing bundled story', { storyId: demo2.id });
        }
        addStory(demo2);
      }
    } catch (error) {
      initError = initError ?? error;
      ErrorHandler.handle('Failed to add demo stories', error, ErrorCategory.STORAGE);
    }

    // Seed media library if empty
    try {
      const libraryAssets = await getLibraryAssets();
      if (libraryAssets.length === 0) {
        await Promise.all([
          addAssetToLibrary('assets/background/bg-ancient-library.png', 'Ancient Library', 'image'),
          addAssetToLibrary('assets/background/bg-museum-entrance.png', 'Museum Entrance', 'image'),
          addAssetToLibrary('assets/sounds-sample/music-magical.mp3', 'Magical Music', 'audio'),
          addAssetToLibrary('assets/sounds-sample/music-mysterious-adventure.mp3', 'Mysterious Adventure', 'audio'),
          addAssetToLibrary('assets/sounds-sample/sfx-door-open.mp3', 'Door Open SFX', 'audio'),
        ]);
      }
    } catch (error) {
      initError = initError ?? error;
      ErrorHandler.handle('Failed to seed media library', error, ErrorCategory.STORAGE);
    }

    if (initError && __DEV__) {
      console.warn('[HomeScreen] initialization completed with errors:', initError);
    }

    setIsInitialized(true);
  }, [loadStories, addStory]);

  // Safety timeout: force-show UI after 8 seconds even if initialization hangs
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialized(true);
    }, 8_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  const handlePlayStory = useCallback((story: StoryMetadata) => {
    if (__DEV__) console.log('[DIAG] handlePlayStory called with storyId:', story.id);
    navigateWithViewTransition(() => {
      router.push({
        pathname: '/reader',
        params: { storyId: story.id, resume: '0' },
      });
    });
  }, [router]);

  const renderStoryCard = useCallback(
    ({ item }: { item: StoryMetadata }) => <StoryCard item={item} onPress={handlePlayStory} />,
    [handlePlayStory]
  );

  const handleOpenEditor = useCallback(() => {
    if (__DEV__) console.log('[DIAG] handleOpenEditor called');
    navigateWithViewTransition(() => router.push('/editor'), 'surface-shift');
  }, [router]);

  const handleOpenSettings = useCallback(() => {
    if (__DEV__) console.log('[DIAG] handleOpenSettings called');
    navigateWithViewTransition(() => router.push('/settings'), 'surface-shift');
  }, [router]);

  const colors = useColors();
  const storyColumns = useMemo(() => {
    if (Platform.OS !== 'web') return 1;
    if (width >= 1180) return 3;
    if (width >= 760) return 2;
    return 1;
  }, [width]);
  const contentWidthStyle = useMemo(
    () => (Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 1180, alignSelf: 'center' as const } : null),
    [],
  );

  if (!isInitialized) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.loadingTitle, { color: colors.foreground }]}>{t('common.loading')}</Text>
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            {t('home.preparingLibrary')}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-4 py-5" edges={["top", "left", "right", "bottom"]}>
      <View style={contentWidthStyle}>
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>{t('home.productName')}</Text>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>{t('home.stories')}</Text>
            <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
              {t('home.heroSubtitle')}
            </Text>
          </View>

          <View style={styles.heroActions}>
            <Button variant="primary" size="base" onPress={handleOpenEditor} accessibilityLabel={t('home.edit')}>
              {t('home.edit')}
            </Button>
            <Button variant="secondary" size="base" onPress={handleOpenSettings} accessibilityLabel={t('settings.open')}>
              {t('settings.title')}
            </Button>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{storiesMetadata.length}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{t('home.stories')}</Text>
            </View>
          </View>
        </View>

      {storiesMetadata.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyIcon, { color: colors.primary }]}>{t('common.new')}</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('home.noStories')}</Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {t('home.emptyHint')}
          </Text>
          <Button variant="primary" size="base" onPress={handleOpenEditor} accessibilityLabel={t('home.createStory')}>
            {t('home.createStory')}
          </Button>
        </View>
      ) : (
        <FlatList<StoryMetadata>
          key={`stories-${storyColumns}`}
          data={storiesMetadata}
          renderItem={renderStoryCard}
          keyExtractor={(item) => item.id}
          numColumns={storyColumns}
          columnWrapperStyle={storyColumns > 1 ? styles.storyGridRow : undefined}
          scrollEnabled={true}
          contentContainerStyle={styles.storyList}
          showsVerticalScrollIndicator={false}
        />
      )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingTitle: {
    ...typeScale.sectionTitle,
  },
  loadingText: {
    ...typeScale.label,
    textAlign: 'center',
  },
  hero: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  heroCopy: {
    gap: spacing.sm,
  },
  eyebrow: {
    ...typeScale.caption,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    ...typeScale.pageTitle,
  },
  heroSubtitle: {
    maxWidth: 560,
    ...typeScale.body,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    minWidth: 104,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statValue: {
    ...typeScale.sectionTitle,
    fontWeight: '800',
  },
  statLabel: {
    ...typeScale.caption,
    marginTop: 2,
  },
  storyList: {
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  storyGridRow: {
    gap: spacing.md,
  },
  storyCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  thumbnailFrame: {
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  thumbnail: {
    width: '100%',
    height: 148,
    borderRadius: radius.lg,
  },
  thumbnailPlaceholder: {
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  thumbnailIcon: {
    fontSize: 36,
  },
  storyCardBody: {
    gap: spacing.sm,
  },
  storyCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  storyTitle: {
    flex: 1,
    ...typeScale.body,
    fontWeight: '800',
  },
  sceneBadge: {
    minWidth: 34,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  sceneBadgeText: {
    ...typeScale.caption,
    fontWeight: '800',
  },
  storyDescription: {
    minHeight: 42,
    ...typeScale.label,
  },
  storyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  storyMeta: {
    flex: 1,
    ...typeScale.caption,
  },
  storyMetaCta: {
    ...typeScale.caption,
    fontWeight: '800',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyIcon: {
    ...typeScale.sectionTitle,
  },
  emptyTitle: {
    ...typeScale.sectionTitle,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 360,
    ...typeScale.label,
    textAlign: 'center',
  },
});
