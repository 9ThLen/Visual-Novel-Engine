/**
 * lib/reviews/reviews-store.ts — persistence for device-local reviews.
 *
 * Storage is injected so tests and the app share one implementation. The
 * envelope is versioned from day one: Stage 2 syncs these records to a server,
 * and a version field now is what makes that a migration instead of a rewrite.
 *
 * Reviews are the reader's own words. A parse failure must never take down the
 * story page, so every read degrades to an empty list rather than throwing.
 */

import {
  clampReviewText,
  type ReviewRating,
  type StoryReview,
} from '@/lib/reviews/reviews-domain';

export interface KVStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface UpsertReviewInput {
  rating: ReviewRating;
  text?: string;
  authorName?: string;
  endingsSeen: number;
  finished: boolean;
}

const DEVICE_ID_KEY = 'vn.device-id';
const REVIEWS_KEY_PREFIX = 'vn.reviews.v1.';
const ENVELOPE_VERSION = 1;
const DEFAULT_AUTHOR_NAME = 'Reader';

interface ReviewsEnvelope {
  version: number;
  reviews: StoryReview[];
}

function reviewsKey(storyId: string): string {
  return `${REVIEWS_KEY_PREFIX}${storyId}`;
}

function randomId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isReview(value: unknown): value is StoryReview {
  if (typeof value !== 'object' || value === null) return false;
  const review = value as Partial<StoryReview>;
  return (
    typeof review.id === 'string'
    && typeof review.storyId === 'string'
    && typeof review.deviceId === 'string'
    && typeof review.rating === 'number'
    && review.rating >= 1
    && review.rating <= 5
  );
}

function parseEnvelope(raw: string | null): StoryReview[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const envelope = parsed as Partial<ReviewsEnvelope>;
    if (envelope.version !== ENVELOPE_VERSION) return [];
    if (!Array.isArray(envelope.reviews)) return [];
    return envelope.reviews.filter(isReview);
  } catch {
    return [];
  }
}

export function createReviewsStore(storage: KVStorage) {
  let deviceIdPromise: Promise<string> | null = null;

  async function readReviews(storyId: string): Promise<StoryReview[]> {
    try {
      return parseEnvelope(await storage.getItem(reviewsKey(storyId)));
    } catch {
      return [];
    }
  }

  async function writeReviews(storyId: string, reviews: StoryReview[]): Promise<void> {
    const envelope: ReviewsEnvelope = { version: ENVELOPE_VERSION, reviews };
    await storage.setItem(reviewsKey(storyId), JSON.stringify(envelope));
  }

  function ensureDeviceId(): Promise<string> {
    // Cached so concurrent callers can't race two ids into storage.
    deviceIdPromise ??= (async () => {
      const existing = await storage.getItem(DEVICE_ID_KEY);
      if (existing) return existing;
      const created = randomId();
      await storage.setItem(DEVICE_ID_KEY, created);
      return created;
    })();
    return deviceIdPromise;
  }

  async function getMyReview(storyId: string): Promise<StoryReview | null> {
    const deviceId = await ensureDeviceId();
    return (await readReviews(storyId)).find((review) => review.deviceId === deviceId) ?? null;
  }

  async function upsertMyReview(storyId: string, input: UpsertReviewInput): Promise<StoryReview> {
    const deviceId = await ensureDeviceId();
    const reviews = await readReviews(storyId);
    const index = reviews.findIndex((review) => review.deviceId === deviceId);
    const now = Date.now();
    const existing = index >= 0 ? reviews[index] : null;

    const review: StoryReview = {
      id: existing?.id ?? randomId(),
      storyId,
      deviceId,
      rating: input.rating,
      text: clampReviewText(input.text),
      authorName: input.authorName?.trim() || existing?.authorName || DEFAULT_AUTHOR_NAME,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      endingsSeenAtReview: input.endingsSeen,
      finishedAtReview: input.finished,
      helpfulVotes: existing?.helpfulVotes ?? 0,
      votedHelpfulByMe: existing?.votedHelpfulByMe ?? false,
    };

    const next = [...reviews];
    if (index >= 0) next[index] = review;
    else next.push(review);
    await writeReviews(storyId, next);
    return review;
  }

  async function toggleHelpful(storyId: string, reviewId: string): Promise<StoryReview[]> {
    const deviceId = await ensureDeviceId();
    const reviews = await readReviews(storyId);
    const next = reviews.map((review) => {
      if (review.id !== reviewId) return review;
      if (review.deviceId === deviceId) return review; // voting for yourself is not a signal
      const voted = !review.votedHelpfulByMe;
      return {
        ...review,
        votedHelpfulByMe: voted,
        helpfulVotes: Math.max(0, review.helpfulVotes + (voted ? 1 : -1)),
      };
    });
    await writeReviews(storyId, next);
    return next;
  }

  return {
    ensureDeviceId,
    getReviews: readReviews,
    getMyReview,
    upsertMyReview,
    toggleHelpful,
  };
}

export type ReviewsStore = ReturnType<typeof createReviewsStore>;
