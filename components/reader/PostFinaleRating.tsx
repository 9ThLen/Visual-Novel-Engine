/**
 * components/reader/PostFinaleRating.tsx
 *
 * Asked at the peak: the credits have just landed and the reader still feels the
 * ending. This is the only moment the engine gets an honest rating for free —
 * ask on the library screen five minutes later and you get a shrug.
 *
 * It delays the exit rather than blocking it: "Later" leaves immediately, and
 * the prompt only ever appears when shouldPromptForReview allows it.
 */

import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { RatingForm } from '@/components/reviews/RatingForm';
import { useI18n } from '@/hooks/use-i18n';
import type { ReviewRating } from '@/lib/reviews/reviews-domain';
import { SHOWCASE_COLORS } from '@/lib/showcase/showcase-colors';

export interface PostFinaleRatingProps {
  sceneName: string | null;
  onSubmit: (rating: ReviewRating, text: string | undefined) => void;
  onDismiss: () => void;
}

export const PostFinaleRating = memo(function PostFinaleRating({
  sceneName,
  onSubmit,
  onDismiss,
}: PostFinaleRatingProps) {
  const { t } = useI18n();

  const handleSubmit = useCallback(
    (rating: ReviewRating, text: string | undefined) => {
      onSubmit(rating, text);
    },
    [onSubmit],
  );

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={styles.backdrop}
      testID="post-finale-rating"
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityRole="button" />

      <Animated.View entering={FadeInDown.duration(280)} style={styles.card}>
        <Text style={styles.title}>{t('finale.title')}</Text>
        {sceneName ? <Text style={styles.scene}>{sceneName}</Text> : null}
        <Text style={styles.subtitle}>{t('finale.subtitle')}</Text>

        <RatingForm
          onSubmit={handleSubmit}
          onCancel={onDismiss}
          submitLabel={t('review.save')}
          cancelLabel={t('review.later')}
        />
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: `${SHOWCASE_COLORS.scrim}cc`,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 22,
    borderRadius: 16,
    backgroundColor: SHOWCASE_COLORS.card,
    borderWidth: 1,
    borderColor: SHOWCASE_COLORS.border,
    gap: 10,
  },
  title: {
    color: SHOWCASE_COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  scene: {
    color: SHOWCASE_COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 14,
    marginBottom: 4,
  },
});
