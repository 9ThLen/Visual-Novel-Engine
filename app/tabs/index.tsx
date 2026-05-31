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
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { ScreenContainer } from '@/components/screen-container';
import { useStoryState, useStoryActions } from '@/lib/story-hooks';
import { useAppStore } from '@/stores/use-app-store';
import { getLibraryAssets, addAssetToLibrary } from '@/lib/media-library-service';
import { Story } from '@/lib/scene-operations'; // TODO(phase-09): replace with canonical type
import { StoryMetadata } from '@/lib/story-domain';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui';
import demoStory from '@/assets/demo-story.json';
import demoStoryAdvanced from '@/assets/demo-story-advanced.json';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { shouldUpsertBundledStory } from '@/lib/bundled-story-sync';
import { navigateWithViewTransition } from '@/lib/navigation-transition';

import { buttonFeedback } from '@/lib/ui-feedback';

interface StoryCardProps {
  item: StoryMetadata;
  onPress: (story: StoryMetadata) => void;
}

function withOpacity(hexColor: string | undefined, opacity: number) {
  if (!hexColor?.startsWith('#') || hexColor.length !== 7) {
    return hexColor ?? `rgba(124, 91, 245, ${opacity})`;
  }

  const red = parseInt(hexColor.slice(1, 3), 16);
  const green = parseInt(hexColor.slice(3, 5), 16);
  const blue = parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

const StoryCard = memo(function StoryCard({ item, onPress }: StoryCardProps) {
  const { t } = useI18n();
  const colors = useColors();
  const accent = withOpacity(colors.primary, 0.14);
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
            Ready to read in the visual novel player.
          </Text>
        )}
        <View style={styles.storyMetaRow}>
          <Text style={[styles.storyMeta, { color: colors.muted }]} numberOfLines={1}>
            {item.author ? `${t('home.by')} ${item.author}` : 'Interactive story'}
          </Text>
          <Text style={[styles.storyMetaCta, { color: colors.primary }]}>Play</Text>
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
      const demo1 = (demoStory as unknown) as Story;
      const demo2 = (demoStoryAdvanced as unknown) as Story;

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
    console.log('[DIAG] handlePlayStory called with storyId:', story.id);
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
    console.log('[DIAG] handleOpenEditor called');
    navigateWithViewTransition(() => router.push('/editor'), 'surface-shift');
  }, [router]);

  const handleOpenSettings = useCallback(() => {
    console.log('[DIAG] handleOpenSettings called');
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
            Preparing your story library…
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
            <Text style={[styles.eyebrow, { color: colors.primary }]}>Visual Novel Engine</Text>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>{t('home.stories')}</Text>
            <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
              Choose a story to play, or jump into the editor to build the next scene.
            </Text>
          </View>

          <View style={styles.heroActions}>
            <Button variant="primary" size="base" onPress={handleOpenEditor} accessibilityLabel={t('home.edit')}>
              {t('home.edit')}
            </Button>
            <Button variant="secondary" size="base" onPress={handleOpenSettings} accessibilityLabel={t('settings.open')}>
              Settings
            </Button>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{storiesMetadata.length}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Stories</Text>
            </View>
          </View>
        </View>

      {storiesMetadata.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyIcon, { color: colors.primary }]}>New</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('home.noStories')}</Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Start with a small scene, then connect it into a playable story flow.
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
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  loadingText: {
    fontSize: 14,
    textAlign: 'center',
  },
  hero: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    marginBottom: 18,
    gap: 18,
  },
  heroCopy: {
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    maxWidth: 560,
    fontSize: 15,
    lineHeight: 22,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    minWidth: 104,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  storyList: {
    paddingBottom: 28,
    gap: 14,
  },
  storyGridRow: {
    gap: 14,
  },
  storyCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    marginBottom: 14,
    gap: 12,
  },
  thumbnailFrame: {
    overflow: 'hidden',
    borderRadius: 16,
  },
  thumbnail: {
    width: '100%',
    height: 148,
    borderRadius: 16,
  },
  thumbnailPlaceholder: {
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  thumbnailIcon: {
    fontSize: 36,
  },
  storyCardBody: {
    gap: 8,
  },
  storyCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  storyTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  sceneBadge: {
    minWidth: 34,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  sceneBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  storyDescription: {
    minHeight: 42,
    fontSize: 14,
    lineHeight: 21,
  },
  storyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  storyMeta: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  storyMetaCta: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 360,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
