import {
  deletePendingImageRecord,
  getPendingImageRecord,
  listPendingImageRecords,
  putPendingImageRecord,
} from '@/lib/idb-storage';
import {
  MAX_PENDING_IMAGE_AGE_MS,
  MAX_PENDING_IMAGE_BYTES_GLOBAL,
  MAX_PENDING_IMAGES_GLOBAL,
  MAX_PENDING_IMAGES_PER_STORY,
  type PendingAiImage,
  type PendingImageCleanupOptions,
  type PendingImageRepository,
} from './pending-image-storage';

function oldestFirst(a: PendingAiImage, b: PendingAiImage): number {
  return a.createdAt - b.createdAt || a.requestId.localeCompare(b.requestId);
}

function chooseEvictions(images: PendingAiImage[], options: PendingImageCleanupOptions = {}): PendingAiImage[] {
  const now = options.now ?? Date.now();
  const evicted = new Map<string, PendingAiImage>();
  const keep = images.filter((image) => {
    const invalidStory = options.existingStoryIds && !options.existingStoryIds.has(image.storyId);
    const expired = now - image.createdAt > MAX_PENDING_IMAGE_AGE_MS;
    if (invalidStory || expired) evicted.set(image.requestId, image);
    return !invalidStory && !expired;
  });

  const byStory = new Map<string, PendingAiImage[]>();
  for (const image of keep) {
    const entries = byStory.get(image.storyId) ?? [];
    entries.push(image);
    byStory.set(image.storyId, entries);
  }
  for (const entries of byStory.values()) {
    entries.sort(oldestFirst);
    for (const image of entries.slice(0, Math.max(0, entries.length - MAX_PENDING_IMAGES_PER_STORY))) {
      evicted.set(image.requestId, image);
    }
  }

  const remaining = keep.filter((image) => !evicted.has(image.requestId)).sort(oldestFirst);
  while (remaining.length > MAX_PENDING_IMAGES_GLOBAL) {
    const image = remaining.shift();
    if (image) evicted.set(image.requestId, image);
  }
  let bytes = remaining.reduce((total, image) => total + image.blob.size, 0);
  while (bytes > MAX_PENDING_IMAGE_BYTES_GLOBAL && remaining.length) {
    const image = remaining.shift()!;
    bytes -= image.blob.size;
    evicted.set(image.requestId, image);
  }
  return [...evicted.values()];
}

export const pendingImageRepository: PendingImageRepository = {
  get: getPendingImageRecord,

  async put(image) {
    const existing = await getPendingImageRecord<PendingAiImage>(image.requestId);
    if (existing) return existing;
    if (!image.requestId || !image.storyId || !image.mimeType.startsWith('image/') || image.blob.size <= 0) {
      throw new Error('Invalid pending AI image');
    }
    await putPendingImageRecord(image.requestId, image);
    await this.cleanup();
    const persisted = await getPendingImageRecord<PendingAiImage>(image.requestId);
    if (!persisted) throw new Error('Pending AI image exceeded storage limits');
    return persisted;
  },

  async listForStory(storyId) {
    return (await listPendingImageRecords<PendingAiImage>())
      .filter((image) => image.storyId === storyId)
      .sort(oldestFirst);
  },

  delete: deletePendingImageRecord,

  async cleanup(options) {
    const evictions = chooseEvictions(await listPendingImageRecords<PendingAiImage>(), options);
    await Promise.all(evictions.map((image) => deletePendingImageRecord(image.requestId)));
    return evictions.map((image) => image.requestId);
  },
};

export { chooseEvictions };
