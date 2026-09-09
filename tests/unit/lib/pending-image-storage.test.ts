import {
  pendingImageRepository,
  chooseEvictions,
} from '@/lib/ai/pending-image-storage.web';
import {
  MAX_PENDING_IMAGE_AGE_MS,
  MAX_PENDING_IMAGES_PER_STORY,
  type PendingAiImage,
} from '@/lib/ai/pending-image-storage';
import { setPendingImageStorageAdapterForTests } from '@/lib/idb-storage';

const image = (requestId: string, storyId = 'story-1', createdAt = Date.now()): PendingAiImage => ({
  requestId,
  storyId,
  purpose: 'background',
  prompt: requestId,
  mimeType: 'image/webp',
  blob: new Blob(['image'], { type: 'image/webp' }),
  createdAt,
});

describe('pending AI image repository', () => {
  const values = new Map<string, PendingAiImage>();

  beforeEach(() => {
    values.clear();
    setPendingImageStorageAdapterForTests({
      get: async (id) => values.get(id) ?? null,
      put: async (id, value) => { values.set(id, value as PendingAiImage); },
      delete: async (id) => { values.delete(id); },
      list: async () => [...values.values()],
    });
  });

  afterEach(() => setPendingImageStorageAdapterForTests(null));

  it('deduplicates bridge redelivery by request id', async () => {
    const first = await pendingImageRepository.put(image('same'));
    const duplicate = await pendingImageRepository.put({ ...image('same'), prompt: 'replacement' });

    expect(duplicate).toEqual(first);
    expect(values).toHaveLength(1);
    expect(values.get('same')?.prompt).toBe('same');
  });

  it('lists only the requested story in creation order', async () => {
    const now = Date.now();
    await pendingImageRepository.put(image('later', 'story-1', now + 1));
    await pendingImageRepository.put(image('other', 'story-2', now));
    await pendingImageRepository.put(image('earlier', 'story-1', now));

    await expect(pendingImageRepository.listForStory('story-1'))
      .resolves.toEqual([values.get('earlier'), values.get('later')]);
  });

  it('cleans expired and deleted-story records', async () => {
    values.set('expired', image('expired', 'story-1', 0));
    values.set('deleted-story', image('deleted-story', 'story-2', MAX_PENDING_IMAGE_AGE_MS));
    values.set('keep', image('keep', 'story-1', MAX_PENDING_IMAGE_AGE_MS));

    await expect(pendingImageRepository.cleanup({
      now: MAX_PENDING_IMAGE_AGE_MS + 1,
      existingStoryIds: new Set(['story-1']),
    })).resolves.toEqual(expect.arrayContaining(['expired', 'deleted-story']));
    expect([...values.keys()]).toEqual(['keep']);
  });

  it('evicts oldest records over the per-story cap', () => {
    const now = Date.now();
    const records = Array.from({ length: MAX_PENDING_IMAGES_PER_STORY + 2 }, (_, index) =>
      image(`image-${index}`, 'story-1', now + index),
    );
    expect(chooseEvictions(records).map((entry) => entry.requestId)).toEqual(['image-0', 'image-1']);
  });
});
