import type { StoredChatAttachment } from './attachments';
import { chooseAttachmentEvictions, type ChatAttachmentRepository } from './attachment-evictions';

export {
  chooseAttachmentEvictions,
  MAX_AI_BINARY_BYTES_GLOBAL,
  MAX_CHAT_ATTACHMENT_AGE_MS,
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  MAX_CHAT_ATTACHMENTS_PER_STORY,
  ORPHAN_ATTACHMENT_GRACE_MS,
} from './attachment-evictions';
export type { AttachmentCleanupOptions, ChatAttachmentRepository } from './attachment-evictions';

const attachments = new Map<string, StoredChatAttachment>();

/** Native fallback. Web resolves attachment-storage.web.ts and persists in IndexedDB. */
export const chatAttachmentRepository: ChatAttachmentRepository = {
  async get(id) {
    return attachments.get(id) ?? null;
  },
  async put(value) {
    if (!value.id || !value.storyId || value.blob.size !== value.byteSize || value.blob.size <= 0) {
      throw new Error('Invalid chat attachment');
    }
    attachments.set(value.id, value);
    await this.reconcile();
    const stored = attachments.get(value.id);
    if (!stored) throw new Error('Chat attachment exceeded storage limits');
    return stored;
  },
  async delete(id) {
    attachments.delete(id);
  },
  async list() {
    return [...attachments.values()];
  },
  async listForStory(storyId) {
    return [...attachments.values()]
      .filter((value) => value.storyId === storyId)
      .sort((a, b) => a.createdAt - b.createdAt);
  },
  async reconcile(options) {
    const evictions = chooseAttachmentEvictions([...attachments.values()], options);
    evictions.forEach((value) => attachments.delete(value.id));
    return evictions.map((value) => value.id);
  },
};
