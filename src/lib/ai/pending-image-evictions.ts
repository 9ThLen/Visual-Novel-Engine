import type { PendingAiImage, PendingImageCleanupOptions } from './pending-image-storage';

export const MAX_PENDING_IMAGES_PER_STORY = 20;
export const MAX_PENDING_IMAGES_GLOBAL = 50;
export const MAX_PENDING_IMAGE_BYTES_GLOBAL = 100 * 1024 * 1024;
export const MAX_PENDING_IMAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function oldestFirst(a: PendingAiImage, b: PendingAiImage): number {
  return a.createdAt - b.createdAt || a.requestId.localeCompare(b.requestId);
}

export function choosePendingImageEvictions(
  images: PendingAiImage[],
  options: PendingImageCleanupOptions = {},
): PendingAiImage[] {
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
