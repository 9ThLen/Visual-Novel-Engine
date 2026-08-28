import type { StoredChatAttachment } from './attachments';

export const MAX_CHAT_ATTACHMENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ORPHAN_ATTACHMENT_GRACE_MS = 60 * 60 * 1000;
export const MAX_CHAT_ATTACHMENTS_PER_STORY = 100;
export const MAX_CHAT_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_AI_BINARY_BYTES_GLOBAL = 100 * 1024 * 1024;

export interface AttachmentCleanupOptions {
  existingStoryIds?: ReadonlySet<string>;
  referencedAttachmentIds?: ReadonlySet<string>;
  now?: number;
}

export interface ChatAttachmentRepository {
  get(id: string): Promise<StoredChatAttachment | null>;
  put(value: StoredChatAttachment): Promise<StoredChatAttachment>;
  delete(id: string): Promise<void>;
  list(): Promise<StoredChatAttachment[]>;
  listForStory(storyId: string): Promise<StoredChatAttachment[]>;
  reconcile(options?: AttachmentCleanupOptions): Promise<string[]>;
}

export function chooseAttachmentEvictions(values: StoredChatAttachment[], options: AttachmentCleanupOptions = {}): StoredChatAttachment[] {
  const now = options.now ?? Date.now();
  const sorted = [...values].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const evicted = new Map<string, StoredChatAttachment>();
  const keep = sorted.filter((value) => {
    const invalidStory = options.existingStoryIds && !options.existingStoryIds.has(value.storyId);
    const orphan = options.referencedAttachmentIds
      && !options.referencedAttachmentIds.has(value.id)
      && (Boolean(value.messageId) || now - value.createdAt > ORPHAN_ATTACHMENT_GRACE_MS);
    const expired = now - value.createdAt > MAX_CHAT_ATTACHMENT_AGE_MS;
    if (invalidStory || orphan || expired) evicted.set(value.id, value);
    return !invalidStory && !orphan && !expired;
  });
  const storyCounts = new Map<string, number>();
  const messageCounts = new Map<string, number>();
  for (const value of [...keep].reverse()) {
    const storyCount = (storyCounts.get(value.storyId) ?? 0) + 1;
    storyCounts.set(value.storyId, storyCount);
    const messageKey = `${value.storyId}:${value.messageId ?? ''}`;
    const messageCount = (messageCounts.get(messageKey) ?? 0) + 1;
    messageCounts.set(messageKey, messageCount);
    if (storyCount > MAX_CHAT_ATTACHMENTS_PER_STORY || (value.messageId && messageCount > MAX_CHAT_ATTACHMENTS_PER_MESSAGE)) evicted.set(value.id, value);
  }
  let bytes = keep.filter((value) => !evicted.has(value.id)).reduce((sum, value) => sum + value.blob.size, 0);
  for (const value of keep) {
    if (bytes <= MAX_AI_BINARY_BYTES_GLOBAL) break;
    if (!evicted.has(value.id)) { evicted.set(value.id, value); bytes -= value.blob.size; }
  }
  return [...evicted.values()];
}
