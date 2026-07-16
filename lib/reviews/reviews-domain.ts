/**
 * lib/reviews/reviews-domain.ts — pure review maths.
 *
 * Stage 1 is device-local, so most stories will sit far below the count where
 * an aggregate means anything. `verdict` is null under MIN_VERDICT_REVIEWS on
 * purpose: the UI reads that as "show a personal rating, not a Steam verdict".
 */

export type ReviewRating = 1 | 2 | 3 | 4 | 5;

export interface StoryReview {
  id: string;
  storyId: string;
  rating: ReviewRating;
  text?: string;
  authorName: string;
  deviceId: string;
  createdAt: number;
  updatedAt: number;
  endingsSeenAtReview: number;
  finishedAtReview: boolean;
  helpfulVotes: number;
  votedHelpfulByMe: boolean;
}

export type ReviewVerdict =
  | 'overwhelminglyPositive'
  | 'veryPositive'
  | 'positive'
  | 'mixed'
  | 'negative';

export interface ReviewAggregate {
  count: number;
  average: number;
  distribution: Record<ReviewRating, number>;
  verdict: ReviewVerdict | null;
}

/** Below this, an average and a histogram are noise dressed up as data. */
export const MIN_VERDICT_REVIEWS = 3;
export const REVIEW_TEXT_MAX_CHARS = 2000;
const OVERWHELMING_MIN_REVIEWS = 10;

export const RATINGS: readonly ReviewRating[] = [1, 2, 3, 4, 5];

function emptyDistribution(): Record<ReviewRating, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function verdictFor(positiveShare: number, count: number): ReviewVerdict {
  if (positiveShare >= 0.95 && count >= OVERWHELMING_MIN_REVIEWS) return 'overwhelminglyPositive';
  if (positiveShare >= 0.85) return 'veryPositive';
  if (positiveShare >= 0.7) return 'positive';
  if (positiveShare >= 0.4) return 'mixed';
  return 'negative';
}

export function computeAggregate(reviews: StoryReview[]): ReviewAggregate {
  const distribution = emptyDistribution();
  let total = 0;
  let positive = 0;

  for (const review of reviews) {
    distribution[review.rating] += 1;
    total += review.rating;
    if (review.rating >= 4) positive += 1;
  }

  const count = reviews.length;
  if (count === 0) {
    return { count: 0, average: 0, distribution, verdict: null };
  }

  return {
    count,
    average: Math.round((total / count) * 10) / 10,
    distribution,
    verdict: count < MIN_VERDICT_REVIEWS ? null : verdictFor(positive / count, count),
  };
}

export function sortReviews(reviews: StoryReview[], mode: 'helpful' | 'recent'): StoryReview[] {
  return [...reviews].sort((a, b) => {
    if (mode === 'helpful' && b.helpfulVotes !== a.helpfulVotes) {
      return b.helpfulVotes - a.helpfulVotes;
    }
    return b.updatedAt - a.updatedAt;
  });
}

export function clampReviewText(text: string | undefined): string | undefined {
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, REVIEW_TEXT_MAX_CHARS);
}
