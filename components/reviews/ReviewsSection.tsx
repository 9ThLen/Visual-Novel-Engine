/**
 * components/reviews/ReviewsSection.tsx
 *
 * Two modes, because Stage 1 reviews are device-local. A "4.8 · 1 review" hero
 * number over a histogram with one bar isn't social proof — it's a broken copy
 * of Steam. Below MIN_VERDICT_REVIEWS this is simply the reader's own rating;
 * the aggregate, sorting and helpful votes appear once there are enough voices
 * for them to mean something.
 */

import React, { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RatingForm } from '@/components/reviews/RatingForm';
import { useI18n } from '@/hooks/use-i18n';
import {
  computeAggregate,
  MIN_VERDICT_REVIEWS,
  RATINGS,
  sortReviews,
  type ReviewRating,
  type StoryReview,
} from '@/lib/reviews/reviews-domain';
import { SHOWCASE_COLORS } from '@/lib/showcase/showcase-colors';

export interface ReviewsSectionProps {
  reviews: StoryReview[];
  myReview: StoryReview | null;
  onSubmit: (rating: ReviewRating, text: string | undefined) => void;
  onToggleHelpful: (reviewId: string) => void;
}

function Stars({ rating }: { rating: number }) {
  return (
    <Text style={styles.stars}>
      {RATINGS.map((value) => (value <= rating ? '★' : '☆')).join('')}
    </Text>
  );
}

const ReviewCard = memo(function ReviewCard({
  review,
  isMine,
  showHelpful,
  onToggleHelpful,
}: {
  review: StoryReview;
  isMine: boolean;
  showHelpful: boolean;
  onToggleHelpful: (reviewId: string) => void;
}) {
  const { t } = useI18n();
  const initials = review.authorName.trim().charAt(0).toUpperCase() || '?';

  return (
    <View style={[styles.card, isMine && styles.cardMine]}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.author}>{isMine ? t('storyPage.yourReview') : review.authorName}</Text>
          {review.finishedAtReview ? (
            <Text style={styles.badge}>
              {t('storyPage.finishedBadge', { count: review.endingsSeenAtReview })}
            </Text>
          ) : null}
        </View>
        <Stars rating={review.rating} />
      </View>

      {review.text ? <Text style={styles.reviewText}>{review.text}</Text> : null}

      {showHelpful && !isMine ? (
        <Pressable
          onPress={() => onToggleHelpful(review.id)}
          accessibilityRole="button"
          style={styles.helpful}
        >
          <Text style={[styles.helpfulText, review.votedHelpfulByMe && styles.helpfulTextActive]}>
            {t('storyPage.helpful', { count: review.helpfulVotes })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export const ReviewsSection = memo(function ReviewsSection({
  reviews,
  myReview,
  onSubmit,
  onToggleHelpful,
}: ReviewsSectionProps) {
  const { t } = useI18n();
  const [sortMode, setSortMode] = useState<'helpful' | 'recent'>('helpful');
  const [isEditing, setIsEditing] = useState(false);

  const aggregate = useMemo(() => computeAggregate(reviews), [reviews]);
  const isCommunityMode = aggregate.count >= MIN_VERDICT_REVIEWS;

  const ordered = useMemo(() => {
    const sorted = sortReviews(reviews, sortMode);
    if (!myReview) return sorted;
    // Your own words stay on top: the page is also where you come back to edit.
    return [myReview, ...sorted.filter((review) => review.id !== myReview.id)];
  }, [reviews, sortMode, myReview]);

  const handleSubmit = (rating: ReviewRating, text: string | undefined) => {
    onSubmit(rating, text);
    setIsEditing(false);
  };

  if (isEditing || (!myReview && reviews.length === 0)) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {isCommunityMode ? t('storyPage.reviewsTitle') : t('storyPage.yourRating')}
        </Text>
        <Text style={styles.prompt}>
          {reviews.length === 0 ? t('storyPage.beFirst') : t('storyPage.rateHint')}
        </Text>
        <RatingForm
          initialRating={myReview?.rating ?? null}
          initialText={myReview?.text ?? ''}
          onSubmit={handleSubmit}
          onCancel={isEditing ? () => setIsEditing(false) : undefined}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {isCommunityMode ? t('storyPage.reviewsTitle') : t('storyPage.yourRating')}
        </Text>

        {isCommunityMode ? (
          <View style={styles.sortToggle}>
            {(['helpful', 'recent'] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setSortMode(mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: sortMode === mode }}
                style={[styles.sortButton, sortMode === mode && styles.sortButtonActive]}
              >
                <Text style={[styles.sortText, sortMode === mode && styles.sortTextActive]}>
                  {mode === 'helpful' ? t('storyPage.sortHelpful') : t('storyPage.sortRecent')}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable onPress={() => setIsEditing(true)} accessibilityRole="button">
            <Text style={styles.change}>{t('storyPage.change')}</Text>
          </Pressable>
        )}
      </View>

      {isCommunityMode ? (
        <View style={styles.aggregate}>
          <View style={styles.aggregateScore}>
            <Text style={styles.average}>{aggregate.average.toFixed(1)}</Text>
            <Text style={styles.verdict}>
              {aggregate.verdict ? t(`review.verdict.${aggregate.verdict}`) : ''}
            </Text>
            <Text style={styles.count}>{t('storyPage.reviewCount', { count: aggregate.count })}</Text>
          </View>

          <View style={styles.distribution}>
            {[...RATINGS].reverse().map((value) => {
              const share = aggregate.count ? aggregate.distribution[value] / aggregate.count : 0;
              return (
                <View key={value} style={styles.distributionRow}>
                  <Text style={styles.distributionLabel}>{value}</Text>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.round(share * 100)}%` }]} />
                  </View>
                  <Text style={styles.distributionCount}>{aggregate.distribution[value]}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {ordered.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            isMine={review.id === myReview?.id}
            showHelpful={isCommunityMode}
            onToggleHelpful={onToggleHelpful}
          />
        ))}
      </View>

      {isCommunityMode && myReview ? (
        <Pressable onPress={() => setIsEditing(true)} accessibilityRole="button">
          <Text style={styles.change}>{t('storyPage.change')}</Text>
        </Pressable>
      ) : null}

      {!myReview ? (
        <Pressable
          onPress={() => setIsEditing(true)}
          accessibilityRole="button"
          style={styles.rateButton}
        >
          <Text style={styles.rateButtonText}>{t('storyPage.rate')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 20,
    marginTop: 28,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: SHOWCASE_COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  prompt: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 14,
  },
  sortToggle: {
    flexDirection: 'row',
    gap: 6,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  sortButtonActive: {
    backgroundColor: `${SHOWCASE_COLORS.text}14`,
  },
  sortText: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  sortTextActive: {
    color: SHOWCASE_COLORS.text,
  },
  change: {
    color: SHOWCASE_COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  aggregate: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
  },
  aggregateScore: {
    minWidth: 96,
  },
  average: {
    color: SHOWCASE_COLORS.text,
    fontSize: 40,
    fontWeight: '800',
  },
  verdict: {
    color: SHOWCASE_COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  count: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 12,
  },
  distribution: {
    flex: 1,
    gap: 4,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distributionLabel: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 12,
    width: 10,
  },
  bar: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: `${SHOWCASE_COLORS.text}14`,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: SHOWCASE_COLORS.accent,
  },
  distributionCount: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 12,
    width: 18,
    textAlign: 'right',
  },
  list: {
    gap: 12,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: SHOWCASE_COLORS.card,
    gap: 8,
  },
  cardMine: {
    borderWidth: 1,
    borderColor: SHOWCASE_COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: `${SHOWCASE_COLORS.accent}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: SHOWCASE_COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },
  cardHeaderText: {
    flex: 1,
  },
  author: {
    color: SHOWCASE_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 11,
  },
  stars: {
    color: SHOWCASE_COLORS.accent,
    fontSize: 13,
    letterSpacing: 1,
  },
  reviewText: {
    color: SHOWCASE_COLORS.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  helpful: {
    alignSelf: 'flex-start',
  },
  helpfulText: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  helpfulTextActive: {
    color: SHOWCASE_COLORS.accent,
  },
  rateButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SHOWCASE_COLORS.border,
  },
  rateButtonText: {
    color: SHOWCASE_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
