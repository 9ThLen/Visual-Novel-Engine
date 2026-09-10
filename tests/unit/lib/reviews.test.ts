import {
  computeAggregate,
  sortReviews,
  type ReviewRating,
  type StoryReview,
} from '@/lib/reviews/reviews-domain';
import { shouldPromptForReview } from '@/lib/reviews/review-prompt';
import { createReviewsStore, type KVStorage } from '@/lib/reviews/reviews-store';

function review(overrides: Partial<StoryReview> = {}): StoryReview {
  return {
    id: 'r1',
    storyId: 'story-1',
    rating: 5,
    authorName: 'Reader',
    deviceId: 'device-1',
    createdAt: 1,
    updatedAt: 1,
    endingsSeenAtReview: 1,
    finishedAtReview: true,
    helpfulVotes: 0,
    votedHelpfulByMe: false,
    ...overrides,
  };
}

function ratings(...values: ReviewRating[]): StoryReview[] {
  return values.map((rating, i) => review({ id: `r${i}`, rating, deviceId: `device-${i}` }));
}

function memoryStorage(): KVStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
  };
}

describe('computeAggregate', () => {
  it('withholds a verdict below three reviews', () => {
    expect(computeAggregate([]).verdict).toBeNull();
    expect(computeAggregate(ratings(5)).verdict).toBeNull();
    expect(computeAggregate(ratings(5, 5)).verdict).toBeNull();
    expect(computeAggregate(ratings(5, 5, 5)).verdict).not.toBeNull();
  });

  it('needs ten reviews before a verdict can be overwhelming', () => {
    expect(computeAggregate(ratings(...Array(9).fill(5) as ReviewRating[])).verdict).toBe('veryPositive');
    expect(computeAggregate(ratings(...Array(10).fill(5) as ReviewRating[])).verdict).toBe('overwhelminglyPositive');
  });

  it('maps positive share to a verdict at each threshold', () => {
    // 17/20 = 0.85 → veryPositive; one fewer positive (0.80) drops to positive.
    const withPositives = (positives: number, total: number) =>
      computeAggregate(
        ratings(...([...Array(positives).fill(5), ...Array(total - positives).fill(1)] as ReviewRating[])),
      ).verdict;

    expect(withPositives(17, 20)).toBe('veryPositive');
    expect(withPositives(16, 20)).toBe('positive');
    expect(withPositives(14, 20)).toBe('positive');
    expect(withPositives(13, 20)).toBe('mixed');
    expect(withPositives(8, 20)).toBe('mixed');
    expect(withPositives(7, 20)).toBe('negative');
  });

  it('reports average to one decimal and a full distribution', () => {
    const aggregate = computeAggregate(ratings(5, 4, 4));

    expect(aggregate.average).toBe(4.3);
    expect(aggregate.count).toBe(3);
    expect(aggregate.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 });
  });
});

describe('sortReviews', () => {
  it('sorts by helpful votes then recency, without mutating the input', () => {
    const input = [
      review({ id: 'a', helpfulVotes: 1, updatedAt: 10 }),
      review({ id: 'b', helpfulVotes: 5, updatedAt: 1 }),
      review({ id: 'c', helpfulVotes: 5, updatedAt: 9 }),
    ];
    const snapshot = input.map((r) => r.id);

    expect(sortReviews(input, 'helpful').map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(sortReviews(input, 'recent').map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(input.map((r) => r.id)).toEqual(snapshot);
  });
});

describe('createReviewsStore', () => {
  it('keeps one stable device id', async () => {
    const storage = memoryStorage();
    const store = createReviewsStore(storage);

    const first = await store.ensureDeviceId();
    const second = await createReviewsStore(storage).ensureDeviceId();

    expect(first).toBe(second);
    expect(storage.map.get('vn.device-id')).toBe(first);
  });

  it('updates my review in place, preserving createdAt and votes', async () => {
    const store = createReviewsStore(memoryStorage());

    const created = await store.upsertMyReview('story-1', { rating: 4, endingsSeen: 1, finished: true });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = await store.upsertMyReview('story-1', {
      rating: 5,
      text: 'Better on reread',
      endingsSeen: 2,
      finished: true,
    });

    expect(await store.getReviews('story-1')).toHaveLength(1);
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
    expect(updated.rating).toBe(5);
    expect(updated.text).toBe('Better on reread');
  });

  it('trims review text to the storage limit', async () => {
    const store = createReviewsStore(memoryStorage());
    const saved = await store.upsertMyReview('story-1', {
      rating: 5,
      text: 'x'.repeat(2500),
      endingsSeen: 1,
      finished: true,
    });

    expect(saved.text).toHaveLength(2000);
  });

  it('toggles helpful votes on other readers and never on my own', async () => {
    const storage = memoryStorage();
    const store = createReviewsStore(storage);
    const deviceId = await store.ensureDeviceId();

    await storage.setItem(
      'vn.reviews.v1.story-1',
      JSON.stringify({
        version: 1,
        reviews: [review({ id: 'mine', deviceId }), review({ id: 'theirs', deviceId: 'other' })],
      }),
    );

    const voted = await store.toggleHelpful('story-1', 'theirs');
    expect(voted.find((r) => r.id === 'theirs')?.helpfulVotes).toBe(1);

    const unvoted = await store.toggleHelpful('story-1', 'theirs');
    expect(unvoted.find((r) => r.id === 'theirs')?.helpfulVotes).toBe(0);

    const own = await store.toggleHelpful('story-1', 'mine');
    expect(own.find((r) => r.id === 'mine')?.helpfulVotes).toBe(0);
    expect(own.find((r) => r.id === 'mine')?.votedHelpfulByMe).toBe(false);
  });

  it('degrades to an empty list on corrupt or foreign data', async () => {
    const storage = memoryStorage();
    const store = createReviewsStore(storage);

    await storage.setItem('vn.reviews.v1.story-1', '{not json');
    await expect(store.getReviews('story-1')).resolves.toEqual([]);

    await storage.setItem('vn.reviews.v1.story-1', JSON.stringify({ version: 99, reviews: [review()] }));
    await expect(store.getReviews('story-1')).resolves.toEqual([]);

    await storage.setItem('vn.reviews.v1.story-1', JSON.stringify({ version: 1, reviews: [{ junk: true }] }));
    await expect(store.getReviews('story-1')).resolves.toEqual([]);
  });
});

describe('shouldPromptForReview', () => {
  it.each([
    { before: 0, after: 1, hasMyReview: false, expected: true, why: 'first ending, no review' },
    { before: 0, after: 1, hasMyReview: true, expected: true, why: 'first ending of a reviewed story' },
    { before: 1, after: 2, hasMyReview: false, expected: true, why: 'new ending, still no review' },
    { before: 1, after: 2, hasMyReview: true, expected: false, why: 'already reviewed, collecting endings' },
    { before: 2, after: 2, hasMyReview: false, expected: false, why: 'replayed a known ending' },
  ])('$why → $expected', ({ before, after, hasMyReview, expected }) => {
    expect(shouldPromptForReview(before, after, hasMyReview)).toBe(expected);
  });
});
