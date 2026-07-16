export interface PendingAiImage {
  requestId: string;
  storyId: string;
  purpose: string;
  prompt: string;
  mimeType: string;
  blob: Blob;
  width?: number;
  height?: number;
  estimatedCostUsd?: unknown;
  createdAt: number;
}

export interface PendingImageCleanupOptions {
  existingStoryIds?: ReadonlySet<string>;
  now?: number;
}

export interface PendingImageRepository {
  get(requestId: string): Promise<PendingAiImage | null>;
  put(image: PendingAiImage): Promise<PendingAiImage>;
  listForStory(storyId: string): Promise<PendingAiImage[]>;
  delete(requestId: string): Promise<void>;
  cleanup(options?: PendingImageCleanupOptions): Promise<string[]>;
}

export const MAX_PENDING_IMAGES_PER_STORY = 20;
export const MAX_PENDING_IMAGES_GLOBAL = 50;
export const MAX_PENDING_IMAGE_BYTES_GLOBAL = 100 * 1024 * 1024;
export const MAX_PENDING_IMAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
