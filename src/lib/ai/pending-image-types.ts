export interface PendingAiImage {
  requestId: string;
  storyId: string;
  purpose: string;
  prompt: string;
  mimeType: string;
  provider?: 'openai' | 'gemini';
  model?: string;
  placement?: import('@/lib/bridge-protocol').BridgeImagePlacement;
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
