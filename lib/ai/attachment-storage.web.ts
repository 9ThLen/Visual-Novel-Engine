import { deleteChatAttachmentRecord, getChatAttachmentRecord, listChatAttachmentRecords, putChatAttachmentRecord } from '@/lib/idb-storage';
import type { StoredChatAttachment } from './attachments';
import { chooseAttachmentEvictions, type ChatAttachmentRepository } from './attachment-storage';

export const chatAttachmentRepository: ChatAttachmentRepository = {
  get: getChatAttachmentRecord,
  async put(value) {
    if (!value.id || !value.storyId || value.blob.size !== value.byteSize || value.blob.size <= 0) throw new Error('Invalid chat attachment');
    await putChatAttachmentRecord(value.id, value);
    await this.reconcile();
    const persisted = await getChatAttachmentRecord<StoredChatAttachment>(value.id);
    if (!persisted) throw new Error('Chat attachment exceeded storage limits');
    return persisted;
  },
  delete: deleteChatAttachmentRecord,
  list: listChatAttachmentRecords,
  async listForStory(storyId) {
    return (await listChatAttachmentRecords<StoredChatAttachment>()).filter((value) => value.storyId === storyId).sort((a, b) => a.createdAt - b.createdAt);
  },
  async reconcile(options) {
    const evictions = chooseAttachmentEvictions(await listChatAttachmentRecords<StoredChatAttachment>(), options);
    await Promise.all(evictions.map((value) => deleteChatAttachmentRecord(value.id)));
    return evictions.map((value) => value.id);
  },
};
