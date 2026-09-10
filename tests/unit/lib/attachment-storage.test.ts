import { chatAttachmentRepository } from '@/lib/ai/attachment-storage.web';
import { chooseAttachmentEvictions, MAX_CHAT_ATTACHMENT_AGE_MS } from '@/lib/ai/attachment-storage';
import type { StoredChatAttachment } from '@/lib/ai/attachments';
import { setChatAttachmentStorageAdapterForTests } from '@/lib/idb-storage';

const value = (id: string, createdAt = Date.now(), storyId = 'story-1', messageId?: string): StoredChatAttachment => ({
  id, storyId, messageId, name: `${id}.txt`, kind: 'text', mimeType: 'text/plain', byteSize: 1,
  blob: new Blob(['x'], { type: 'text/plain' }), createdAt,
});

describe('chat attachment repository', () => {
  const records = new Map<string, StoredChatAttachment>();
  beforeEach(() => {
    records.clear();
    setChatAttachmentStorageAdapterForTests({
      get: async (id) => records.get(id) ?? null,
      put: async (id, item) => { records.set(id, item as StoredChatAttachment); },
      delete: async (id) => { records.delete(id); },
      list: async () => [...records.values()],
    });
  });
  afterEach(() => setChatAttachmentStorageAdapterForTests(null));

  it('persists, retrieves, lists, and deletes independently per story', async () => {
    await chatAttachmentRepository.put(value('a'));
    await chatAttachmentRepository.put(value('b', Date.now(), 'story-2'));
    await expect(chatAttachmentRepository.get('a')).resolves.toMatchObject({ id: 'a' });
    await expect(chatAttachmentRepository.listForStory('story-1')).resolves.toHaveLength(1);
    await chatAttachmentRepository.delete('a');
    await expect(chatAttachmentRepository.get('a')).resolves.toBeNull();
  });

  it('evicts expired, deleted-story, and unreferenced orphan records', () => {
    const now = MAX_CHAT_ATTACHMENT_AGE_MS + 1;
    const evicted = chooseAttachmentEvictions([
      value('expired', 0, 'story-1', 'message-1'),
      value('deleted-story', now, 'story-2', 'message-2'),
      value('orphan', now - 2 * 60 * 60 * 1000, 'story-1'),
      value('keep', now, 'story-1', 'message-3'),
    ], { now, existingStoryIds: new Set(['story-1']), referencedAttachmentIds: new Set(['keep']) });
    expect(evicted.map((item) => item.id)).toEqual(expect.arrayContaining(['expired', 'deleted-story', 'orphan']));
    expect(evicted.map((item) => item.id)).not.toContain('keep');
  });
});
