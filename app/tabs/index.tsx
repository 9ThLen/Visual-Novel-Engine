import React, { useEffect, useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { ScreenContainer } from '@/components/screen-container';
import { useStoryState, useStoryActions } from '@/lib/story-hooks';
import { useAppStore } from '@/stores/use-app-store';
import { getLibraryAssets, addAssetToLibrary } from '@/lib/media-library-service';
import { Story } from '@/lib/types';
import { StoryMetadata } from '@/lib/story-domain';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui';
import demoStory from '@/assets/demo-story.json';
import demoStoryAdvanced from '@/assets/demo-story-advanced.json';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { shouldUpsertBundledStory } from '@/lib/bundled-story-sync';

import { buttonFeedback } from '@/lib/ui-feedback';

interface StoryCardProps {
  item: StoryMetadata;
  onPress: (story: StoryMetadata) => void;
}

const StoryCard = memo(function StoryCard({ item, onPress }: StoryCardProps) {
  const { t } = useI18n();
  const colors = useColors();
  return (
    <View style={[{ backgroundColor: colors.surface, borderColor: colors.border }, { borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1 }]}>
      <Pressable
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        onPress={() => {
          buttonFeedback();
          onPress(item);
        }}
        accessibilityLabel={`Play story: ${item.title}`}
        accessibilityRole="button"
      >
        <View className="gap-2">
          {item.thumbnailUri && (
            <Image
              source={{ uri: item.thumbnailUri }}
              className="w-full h-28 rounded-lg mb-2"
              resizeMode="cover"
            />
          )}
          <Text style={[{ color: colors.foreground }, { fontSize: 16, fontWeight: '600' }]}>
            {item.title}
          </Text>
          {item.description ? (
            <Text style={[{ color: colors.muted }, { fontSize: 14, lineHeight: 20 }]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
          {item.author ? (
            <Text style={[{ color: colors.muted }, { fontSize: 12, marginTop: 4 }]}>
              {t('home.by')} {item.author}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});

export default function HomeScreen() {
  const router = useRouter();
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
    router.push({
      pathname: '/reader',
      params: { storyId: story.id, resume: '0' },
    });
  }, [router]);

  const renderStoryCard = useCallback(
    ({ item }: { item: StoryMetadata }) => <StoryCard item={item} onPress={handlePlayStory} />,
    [handlePlayStory]
  );

  const handleOpenEditor = useCallback(() => {
    console.log('[DIAG] handleOpenEditor called');
    router.push('/editor');
  }, [router]);

  const handleOpenSettings = useCallback(() => {
    console.log('[DIAG] handleOpenSettings called');
    router.push('/settings');
  }, [router]);

  const colors = useColors();

  if (!isInitialized) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.foreground }}>{t('common.loading')}</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-4" edges={["top", "left", "right", "bottom"]}>
      <View className="flex-row justify-between items-center mb-5">
        <Text style={[{ color: colors.foreground }, { fontSize: 24, fontWeight: 'bold' }]}>{t('home.stories')}</Text>
        <View className="flex-row gap-2">
          <Button variant="primary" size="sm" onPress={handleOpenEditor} accessibilityLabel={t('home.edit')}>
            {t('home.edit')}
          </Button>
          <Button variant="secondary" size="sm" onPress={handleOpenSettings} accessibilityLabel={t('settings.open')}>
            ⚙️
          </Button>
        </View>
      </View>

      {storiesMetadata.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-4">
          <Text style={[{ color: colors.muted }, { textAlign: 'center' }]}>
            {t('home.noStories')}
          </Text>
          <Button variant="primary" size="base" onPress={handleOpenEditor} accessibilityLabel={t('home.createStory')}>
            {t('home.createStory')}
          </Button>
        </View>
      ) : (
        <FlatList<StoryMetadata>
          data={storiesMetadata}
          renderItem={renderStoryCard}
          keyExtractor={(item) => item.id}
          scrollEnabled={true}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </ScreenContainer>
  );
}
