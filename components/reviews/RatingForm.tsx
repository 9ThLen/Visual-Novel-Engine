/**
 * The rating control, shared by the story page and the post-finale prompt so a
 * reader meets the same form wherever they are asked. Stars commit on tap; the
 * text is optional, because demanding prose is how you get no reviews at all.
 */

import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useI18n } from '@/hooks/use-i18n';
import { RATINGS, type ReviewRating } from '@/lib/reviews/reviews-domain';
import { SHOWCASE_COLORS } from '@/lib/showcase/showcase-colors';
import { buttonFeedback } from '@/lib/ui-feedback';

export interface RatingFormProps {
  initialRating?: ReviewRating | null;
  initialText?: string;
  submitLabel?: string;
  onSubmit: (rating: ReviewRating, text: string | undefined) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}

export const RatingForm = memo(function RatingForm({
  initialRating = null,
  initialText = '',
  submitLabel,
  onSubmit,
  onCancel,
  cancelLabel,
}: RatingFormProps) {
  const { t } = useI18n();
  const [rating, setRating] = useState<ReviewRating | null>(initialRating);
  const [text, setText] = useState(initialText);

  return (
    <View style={styles.container}>
      <View style={styles.stars} accessibilityRole="radiogroup">
        {RATINGS.map((value) => (
          <Pressable
            key={value}
            onPress={() => {
              buttonFeedback();
              setRating(value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: rating === value }}
            accessibilityLabel={t('review.stars', { count: value })}
            hitSlop={6}
          >
            <Text style={[styles.star, { color: rating && value <= rating ? SHOWCASE_COLORS.accent : SHOWCASE_COLORS.muted }]}>
              ★
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t('review.placeholder')}
        placeholderTextColor={SHOWCASE_COLORS.muted}
        style={styles.input}
        multiline
        numberOfLines={3}
      />

      <View style={styles.actions}>
        <Pressable
          onPress={() => rating && onSubmit(rating, text.trim() || undefined)}
          disabled={!rating}
          accessibilityRole="button"
          accessibilityState={{ disabled: !rating }}
          style={({ pressed }) => [
            styles.submit,
            { opacity: !rating ? 0.4 : pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.submitText}>{submitLabel ?? t('review.save')}</Text>
        </Pressable>
        {onCancel ? (
          <Pressable onPress={onCancel} accessibilityRole="button" style={styles.cancel}>
            <Text style={styles.cancelText}>{cancelLabel ?? t('review.later')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  stars: {
    flexDirection: 'row',
    gap: 6,
  },
  star: {
    fontSize: 30,
  },
  input: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SHOWCASE_COLORS.border,
    backgroundColor: SHOWCASE_COLORS.bg,
    color: SHOWCASE_COLORS.text,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  submit: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: SHOWCASE_COLORS.text,
  },
  submitText: {
    color: SHOWCASE_COLORS.bg,
    fontSize: 14,
    fontWeight: '800',
  },
  cancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelText: {
    color: SHOWCASE_COLORS.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
