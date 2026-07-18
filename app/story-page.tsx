/**
 * app/story-page.tsx — a story's own page.
 *
 * The showcase makes a reader curious; this is where they decide. It answers the
 * three questions a store page has to answer — what is this, how long, is it any
 * good — using only numbers the engine can actually count, and nothing it can't.
 *
 * The one door back to the author's world is at the bottom, deliberately: this
 * page belongs to the reader.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ReviewsSection } from '@/components/reviews/ReviewsSection';
import { ScreenContainer } from '@/components/screen-container';
import { LiveSceneBackdrop } from '@/components/showcase/LiveSceneBackdrop';
import { ShowcaseImage } from '@/components/showcase/ShowcaseImage';
import { useLibraryBootstrap } from '@/hooks/useLibraryBootstrap';
import { useI18n } from '@/hooks/use-i18n';
import { navigateWithViewTransition } from '@/lib/navigation-transition';
import { getReviewsStore } from '@/lib/reviews/reviews-storage';
import { computeAggregate, type ReviewRating, type StoryReview } from '@/lib/reviews/reviews-domain';
import {
  buildShowcaseStories,
  posterAssetFor,
  sceneNameFor,
  scenesForStory,
} from '@/lib/showcase/showcase-adapter';
import { SHOWCASE_COLORS } from '@/lib/showcase/showcase-colors';
import { buttonFeedback } from '@/lib/ui-feedback';
import { useAppStore } from '@/stores/use-app-store';

const WEB_BANNER_MAX_HEIGHT = 360;
const BANNER_SCREEN_RATIO = 0.4;
const MAX_GALLERY_FRAMES = 6;

export default function StoryPageScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();

  const storiesMetadata = useAppStore((state) => state.storiesMetadata);
  const sceneRecordsByStory = useAppStore((state) => state.sceneRecordsByStory);
  const saveSlots = useAppStore((state) => state.saveSlots);
  const endingsReachedByStory = useAppStore((state) => state.endingsReachedByStory);
  const imageAssetIdsByStory = useAppStore((state) => state.imageAssetIdsByStory);

  // Reached directly by link or reload, this screen would otherwise have no
  // stories at all: bundled demos are seeded into memory by the bootstrap, and
  // until now only the showcase ran it. The hook is idempotent, so arriving
  // from the showcase costs nothing.
  useLibraryBootstrap();

  const [reviews, setReviews] = useState<StoryReview[]>([]);
  const [myReview, setMyReview] = useState<StoryReview | null>(null);

  const story = useMemo(() => {
    const stories = buildShowcaseStories({
      storiesMetadata,
      sceneRecordsByStory,
      saveSlots,
      endingsReachedByStory,
    });
    return stories.find((candidate) => candidate.id === storyId) ?? null;
  }, [storiesMetadata, sceneRecordsByStory, saveSlots, endingsReachedByStory, storyId]);

  const metadata = useMemo(
    () => storiesMetadata.find((candidate) => candidate.id === storyId) ?? null,
    [storiesMetadata, storyId],
  );

  const scenes = useMemo(
    () => (storyId ? scenesForStory(sceneRecordsByStory, storyId) : []),
    [sceneRecordsByStory, storyId],
  );

  useEffect(() => {
    if (!storyId) return;
    let cancelled = false;
    const store = getReviewsStore();

    void (async () => {
      const [all, mine] = await Promise.all([store.getReviews(storyId), store.getMyReview(storyId)]);
      if (cancelled) return;
      setReviews(all);
      setMyReview(mine);
    })();

    return () => {
      cancelled = true;
    };
  }, [storyId]);

  const handleSubmitReview = useCallback(
    (rating: ReviewRating, text: string | undefined) => {
      if (!storyId || !story) return;
      const store = getReviewsStore();
      void (async () => {
        await store.upsertMyReview(storyId, {
          rating,
          text,
          endingsSeen: story.endingsSeen,
          finished: story.isFinished,
        });
        setReviews(await store.getReviews(storyId));
        setMyReview(await store.getMyReview(storyId));
      })();
    },
    [storyId, story],
  );

  const handleToggleHelpful = useCallback(
    (reviewId: string) => {
      if (!storyId) return;
      void (async () => {
        setReviews(await getReviewsStore().toggleHelpful(storyId, reviewId));
      })();
    },
    [storyId],
  );

  const goBack = useCallback(() => {
    buttonFeedback();
    navigateWithViewTransition(() => router.back());
  }, [router]);

  const openEditor = useCallback(() => {
    buttonFeedback();
    navigateWithViewTransition(() =>
      router.push({ pathname: '/story-home', params: { storyId } }),
    );
  }, [router, storyId]);

  const readStory = useCallback(() => {
    if (!story) return;
    buttonFeedback();
    navigateWithViewTransition(() => {
      router.push({
        pathname: '/reader',
        params: { storyId: story.id, resume: story.hasStarted ? '1' : '0' },
      });
    });
  }, [router, story]);

  const aggregate = useMemo(() => computeAggregate(reviews), [reviews]);

  const galleryAssets = useMemo(
    () => (storyId ? imageAssetIdsByStory?.[storyId] ?? [] : []).slice(0, MAX_GALLERY_FRAMES),
    [imageAssetIdsByStory, storyId],
  );

  const bannerHeight = useMemo(() => {
    const raw = Math.round(height * BANNER_SCREEN_RATIO);
    return Platform.OS === 'web' ? Math.min(raw, WEB_BANNER_MAX_HEIGHT) : raw;
  }, [height]);

  if (!story || !metadata) {
    return (
      <ScreenContainer style={styles.screen} className="items-center justify-center p-6">
        <Text style={styles.notFound}>{t('storyPage.notFound')}</Text>
        <Pressable onPress={goBack} accessibilityRole="button" style={styles.backPill}>
          <Text style={styles.backText}>{t('storyPage.back')}</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  const resumeSceneName = sceneNameFor(scenes, story.lastSceneId);
  // Endings live in the metrics card below; repeating them here would nest a
  // second '·' inside a '·'-joined row.
  const metaParts = [
    story.author,
    ...story.tags.slice(0, 2),
    t('showcase.minutes', { count: story.readMinutes }),
  ].filter(Boolean);

  return (
    <ScreenContainer style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View>
          <LiveSceneBackdrop
            backgroundAsset={posterAssetFor(story)}
            effect={story.bannerEffect}
            fallbackSeed={story.id}
            fallbackLabel={story.title}
            height={bannerHeight}
          >
            <Text style={styles.title} numberOfLines={2}>
              {story.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {metaParts.join(' · ')}
            </Text>

            {/* An aggregate only earns a place in the header once it means
                something; below that it would read as a bad score. */}
            {aggregate.verdict ? (
              <Text style={styles.rating}>
                {`★ ${aggregate.average.toFixed(1)} · ${t('storyPage.reviewCount', {
                  count: aggregate.count,
                })} · ${t(`review.verdict.${aggregate.verdict}`)}`}
              </Text>
            ) : null}

            <View style={styles.ctaRow}>
              <Pressable
                onPress={readStory}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.primaryButtonText}>
                  {story.hasStarted ? t('showcase.continue') : t('showcase.read')}
                </Text>
              </Pressable>
            </View>
            {story.hasStarted && resumeSceneName ? (
              <Text style={styles.fromScene}>{t('storyPage.fromScene', { scene: resumeSceneName })}</Text>
            ) : null}
          </LiveSceneBackdrop>

          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            style={styles.backFloating}
            hitSlop={8}
          >
            <Text style={styles.backText}>‹ {t('storyPage.back')}</Text>
          </Pressable>
        </View>

        {galleryAssets.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gallery}
          >
            {galleryAssets.map((assetRef) => (
              <ShowcaseImage key={assetRef} assetRef={assetRef} style={styles.frame} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : null}

        {metadata.description || story.teaser ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{t('storyPage.about')}</Text>
            <Text style={styles.description}>{metadata.description || story.teaser}</Text>
          </View>
        ) : null}

        <View style={styles.metrics}>
          <Metric value={String(story.branchCount)} label={t('storyPage.branches')} />
          <Metric
            value={`${story.endingsSeen}/${story.endingsTotal}`}
            label={t('storyPage.endingsLabel')}
          />
          <Metric
            value={t('showcase.minutes', { count: story.readMinutes })}
            label={t('storyPage.readTime')}
          />
        </View>

        <ReviewsSection
          reviews={reviews}
          myReview={myReview}
          onSubmit={handleSubmitReview}
          onToggleHelpful={handleToggleHelpful}
        />

        <Pressable onPress={openEditor} accessibilityRole="button" style={styles.editButton}>
          <Text style={styles.editButtonText}>{t('storyPage.edit')}</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const Metric = React.memo(function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: {
    backgroundColor: SHOWCASE_COLORS.bg,
  },
  scroll: {
    paddingBottom: 48,
  },
  notFound: {
    color: SHOWCASE_COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  backFloating: {
    position: 'absolute',
    top: 14,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: `${SHOWCASE_COLORS.scrim}99`,
  },
  backPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: SHOWCASE_COLORS.border,
  },
  backText: {
    color: SHOWCASE_COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: SHOWCASE_COLORS.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  meta: {
    color: SHOWCASE_COLORS.secondary,
    fontSize: 13,
    marginTop: 6,
  },
  rating: {
    color: SHOWCASE_COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
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
  fromScene: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 12,
    marginTop: 8,
  },
  gallery: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  frame: {
    width: 210,
    height: 118,
    borderRadius: 10,
  },
  block: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 8,
  },
  blockTitle: {
    color: SHOWCASE_COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    color: SHOWCASE_COLORS.secondary,
    fontSize: 15,
    lineHeight: 22,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 24,
  },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: SHOWCASE_COLORS.card,
    gap: 4,
  },
  metricValue: {
    color: SHOWCASE_COLORS.text,
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 11,
  },
  editButton: {
    alignSelf: 'flex-start',
    marginTop: 32,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: SHOWCASE_COLORS.border,
  },
  editButtonText: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
});
