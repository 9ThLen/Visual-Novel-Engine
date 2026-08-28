import { choosePendingImageEvictions } from './pending-image-evictions';

import type { PendingAiImage, PendingImageRepository } from './pending-image-types';

export type { PendingAiImage, PendingImageCleanupOptions, PendingImageRepository } from './pending-image-types';

export {
  choosePendingImageEvictions,
  MAX_PENDING_IMAGE_AGE_MS,
  MAX_PENDING_IMAGE_BYTES_GLOBAL,
  MAX_PENDING_IMAGES_GLOBAL,
  MAX_PENDING_IMAGES_PER_STORY,
} from './pending-image-evictions';

const pendingImages = new Map<string, PendingAiImage>();

/** Native fallback. Web resolves pending-image-storage.web.ts and persists in IndexedDB. */
export const pendingImageRepository: PendingImageRepository = {
  async get(requestId) {
    return pendingImages.get(requestId) ?? null;
  },
  async put(image) {
    const existing = pendingImages.get(image.requestId);
    if (existing) return existing;
    if (!image.requestId || !image.storyId || !image.mimeType.startsWith('image/') || image.blob.size <= 0) {
      throw new Error('Invalid pending AI image');
    }
    pendingImages.set(image.requestId, image);
    await this.cleanup();
    const stored = pendingImages.get(image.requestId);
    if (!stored) throw new Error('Pending AI image exceeded storage limits');
    return stored;
  },
  async listForStory(storyId) {
    return [...pendingImages.values()]
      .filter((image) => image.storyId === storyId)
      .sort((a, b) => a.createdAt - b.createdAt || a.requestId.localeCompare(b.requestId));
  },
  async delete(requestId) {
    pendingImages.delete(requestId);
  },
  async cleanup(options) {
    const evictions = choosePendingImageEvictions([...pendingImages.values()], options);
    evictions.forEach((image) => pendingImages.delete(image.requestId));
    return evictions.map((image) => image.requestId);
  },
};
