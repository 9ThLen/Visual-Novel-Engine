/**
 * app/tabs/index.tsx — the showcase.
 *
 * This is where a reader lands, not where an author works: it opens on a living
 * scene from an actual story, offers a hook rather than a description, and keeps
 * the authoring world behind one Studio button. The banner replays an image,
 * parallax and weather — never the reader itself, so the screen opens instantly.
 */

import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { LiveSceneBackdrop } from '@/components/showcase/LiveSceneBackdrop';
import { POSTER_WIDTH, StoryPoster } from '@/components/showcase/StoryPoster';
import { ScreenContainer } from '@/components/screen-container';
import { useLibraryBootstrap } from '@/hooks/useLibraryBootstrap';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { useI18n } from '@/hooks/use-i18n';
import { navigateWithViewTransition } from '@/lib/navigation-transition';
import { buildShowcaseStories, posterAssetFor } from '@/lib/showcase/showcase-adapter';
import { SHOWCASE_COLORS } from '@/lib/showcase/showcase-colors';
import { buildShelves, type ShowcaseStory } from '@/lib/showcase/story-showcase';
import { buttonFeedback } from '@/lib/ui-feedback';
import { useAppStore } from '@/stores/use-app-store';

const WEB_BANNER_MAX_HEIGHT = 480;
const BANNER_SCREEN_RATIO = 0.55;

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { height, width } = useWindowDimensions();
  const { isInitialized } = useLibraryBootstrap();

  useFocusEffect(
    useCallback(() => {
      void stopReaderPlayback();
    }, []),
  );

  const storiesMetadata = useAppStore((state) => state.storiesMetadata);
  const sceneRecordsByStory = useAppStore((state) => state.sceneRecordsByStory);
  const saveSlots = useAppStore((state) => state.saveSlots);
  const endingsReachedByStory = useAppStore((state) => state.endingsReachedByStory);

  const shelves = useMemo(() => {
    const stories = buildShowcaseStories({
      storiesMetadata,
      sceneRecordsByStory,
      saveSlots,
      endingsReachedByStory,
    });
    return buildShelves(stories, Date.now());
  }, [storiesMetadata, sceneRecordsByStory, saveSlots, endingsReachedByStory]);

  const openStudio = useCallback(() => {
    buttonFeedback();
    navigateWithViewTransition(() => router.push('/editor'), 'surface-shift');
  }, [router]);

  const openSettings = useCallback(() => {
    buttonFeedback();
    navigateWithViewTransition(() => router.push('/settings'), 'surface-shift');
  }, [router]);

  const openStoryPage = useCallback(
    (storyId: string) => {
      navigateWithViewTransition(() => router.push({ pathname: '/story-page', params: { storyId } }));
    },
    [router],
  );

  const readStory = useCallback(
    (story: ShowcaseStory) => {
      buttonFeedback();
      navigateWithViewTransition(() => {
        router.push({
          pathname: '/reader',
          params: { storyId: story.id, resume: story.hasStarted ? '1' : '0' },
        });
      });
    },
    [router],
  );

  const captionFor = useCallback(
    (story: ShowcaseStory) =>
      story.isFinished
        ? t('showcase.endingsProgress', { total: story.endingsTotal, seen: story.endingsSeen })
        : t('showcase.minutes', { count: story.readMinutes }),
    [t],
  );

  const bannerHeight = useMemo(() => {
    const raw = Math.round(height * BANNER_SCREEN_RATIO);
    return Platform.OS === 'web' ? Math.min(raw, WEB_BANNER_MAX_HEIGHT) : raw;
  }, [height]);

  if (!isInitialized) {
    return (
      <ScreenContainer className="items-center justify-center p-6" style={styles.screen}>
        <Text style={styles.loadingText}>{t('home.preparingLibrary')}</Text>
      </ScreenContainer>
    );
  }

  const hero = shelves.hero;

  return (
    <ScreenContainer style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>{t('home.productName')}</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={openStudio} accessibilityRole="button" style={styles.headerButton}>
              <Text style={styles.headerButtonText}>{t('showcase.studio')}</Text>
            </Pressable>
            <Pressable
              onPress={openSettings}
              accessibilityRole="button"
              accessibilityLabel={t('settings.title')}
              style={styles.headerButton}
            >
              <Text style={styles.headerButtonText}>{t('settings.title')}</Text>
            </Pressable>
          </View>
        </View>

        {hero ? (
          <LiveSceneBackdrop
            backgroundAsset={posterAssetFor(hero)}
            effect={hero.bannerEffect}
            fallbackSeed={hero.id}
            fallbackLabel={hero.title}
            height={bannerHeight}
          >
            <View style={styles.heroChips}>
              {hero.tags.slice(0, 2).map((tag) => (
                <Text key={tag} style={styles.chip}>
                  {tag}
                </Text>
              ))}
              <Text style={styles.chip}>{t('showcase.minutes', { count: hero.readMinutes })}</Text>
              {hero.hasStarted ? (
                <Text style={styles.chip}>
                  {t('showcase.endingsProgress', { total: hero.endingsTotal, seen: hero.endingsSeen })}
                </Text>
              ) : null}
            </View>

            <Text style={styles.heroTitle} numberOfLines={2}>
              {hero.title}
            </Text>
            {hero.teaser ? (
              <Text style={styles.heroTeaser} numberOfLines={3}>
                «{hero.teaser}»
              </Text>
            ) : null}

            <View style={styles.heroActions}>
              <Pressable
                onPress={() => readStory(hero)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.primaryButtonText}>
                  {hero.hasStarted ? t('showcase.continue') : t('showcase.read')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => openStoryPage(hero.id)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.secondaryButton, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.secondaryButtonText}>{t('showcase.details')}</Text>
              </Pressable>
            </View>
          </LiveSceneBackdrop>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('showcase.emptyTitle')}</Text>
            <Text style={styles.emptyHint}>{t('showcase.emptyHint')}</Text>
            <Pressable onPress={openStudio} accessibilityRole="button" style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('showcase.studio')}</Text>
            </Pressable>
          </View>
        )}

        <Shelf
          title={t('showcase.shelf.continueReading')}
          stories={shelves.continueReading}
          captionFor={captionFor}
          onPress={openStoryPage}
          width={width}
        />
        <Shelf
          title={t('showcase.shelf.unexplored')}
          stories={shelves.unexplored}
          captionFor={captionFor}
          onPress={openStoryPage}
          width={width}
        />
        <Shelf
          title={t('showcase.shelf.quickReads')}
          stories={shelves.quickReads}
          captionFor={captionFor}
          onPress={openStoryPage}
          width={width}
        />
        <Shelf
          title={t('showcase.shelf.fresh')}
          stories={shelves.fresh}
          captionFor={captionFor}
          onPress={openStoryPage}
          width={width}
        />
        <Shelf
          title={t('showcase.shelf.all')}
          stories={shelves.all}
          captionFor={captionFor}
          onPress={openStoryPage}
          width={width}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

interface ShelfProps {
  title: string;
  stories: ShowcaseStory[];
  captionFor: (story: ShowcaseStory) => string;
  onPress: (storyId: string) => void;
  width: number;
}

const Shelf = React.memo(function Shelf({
  title,
  stories,
  captionFor,
  onPress,
  width,
}: ShelfProps) {
  const renderItem = useCallback(
    ({ item }: { item: ShowcaseStory }) => (
      <StoryPoster
        story={item}
        posterAsset={posterAssetFor(item)}
        caption={captionFor(item)}
        onPress={onPress}
      />
    ),
    [captionFor, onPress],
  );

  if (stories.length === 0) return null;

  // One poster can't fill a row, so a short shelf lays out inline instead of
  // pretending to be a scrollable rail.
  const scrollable = stories.length * (POSTER_WIDTH + 12) > width - 32;

  return (
    <View style={styles.shelf}>
      <Text style={styles.shelfTitle}>{title}</Text>
      {scrollable ? (
        <FlatList<ShowcaseStory>
          data={stories}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.shelfRow}
        />
      ) : (
        <View style={styles.shelfRow}>
          {stories.map((story) => (
            <StoryPoster
              key={story.id}
              story={story}
              posterAsset={posterAssetFor(story)}
              caption={captionFor(story)}
              onPress={onPress}
            />
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  screen: {
    backgroundColor: SHOWCASE_COLORS.bg,
  },
  scroll: {
    paddingBottom: 40,
  },
  loadingText: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  wordmark: {
    color: SHOWCASE_COLORS.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: SHOWCASE_COLORS.border,
  },
  headerButtonText: {
    color: SHOWCASE_COLORS.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    // Terracotta, like the reference — the chips are the one place the warm
    // accent shows through the banner's own colours.
    color: SHOWCASE_COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `${SHOWCASE_COLORS.accent}24`,
    overflow: 'hidden',
  },
  heroTitle: {
    color: SHOWCASE_COLORS.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroTeaser: {
    color: SHOWCASE_COLORS.secondary,
    fontSize: 15,
    fontStyle: 'italic',
    marginTop: 8,
    maxWidth: 560,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  primaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: SHOWCASE_COLORS.primary,
  },
  primaryButtonText: {
    color: SHOWCASE_COLORS.onPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${SHOWCASE_COLORS.text}59`,
  },
  secondaryButtonText: {
    color: SHOWCASE_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  shelf: {
    marginTop: 26,
    gap: 12,
  },
  shelfTitle: {
    color: SHOWCASE_COLORS.text,
    fontSize: 17,
    fontWeight: '800',
    paddingHorizontal: 20,
  },
  shelfRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
  },
  empty: {
    margin: 20,
    padding: 28,
    borderRadius: 16,
    backgroundColor: SHOWCASE_COLORS.card,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    color: SHOWCASE_COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyHint: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
  },
});
