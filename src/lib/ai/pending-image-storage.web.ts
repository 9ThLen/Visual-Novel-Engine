import {
  deletePendingImageRecord,
  getPendingImageRecord,
  listPendingImageRecords,
  putPendingImageRecord,
} from '@/lib/idb-storage';
import { choosePendingImageEvictions } from './pending-image-evictions';
import type { PendingAiImage, PendingImageRepository } from './pending-image-types';

function oldestFirst(a: PendingAiImage, b: PendingAiImage): number {
  return a.createdAt - b.createdAt || a.requestId.localeCompare(b.requestId);
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
    const evictions = choosePendingImageEvictions(
      await listPendingImageRecords<PendingAiImage>(),
      options,
    );
    await Promise.all(evictions.map((image) => deletePendingImageRecord(image.requestId)));
    return evictions.map((image) => image.requestId);
  },
};

export { choosePendingImageEvictions as chooseEvictions };
