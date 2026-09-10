import { chatAttachmentRepository } from '@/lib/ai/attachment-storage';
import { pendingImageRepository } from '@/lib/ai/pending-image-storage';

describe('platform-neutral AI binary storage fallbacks', () => {
  it('stores attachments in memory without requiring IndexedDB', async () => {
    const id = 'native-attachment';
    await chatAttachmentRepository.put({
      id,
      storyId: 'story-native',
      name: 'notes.txt',
      kind: 'text',
      mimeType: 'text/plain',
      byteSize: 1,
      blob: new Blob(['x'], { type: 'text/plain' }),
      createdAt: Date.now(),
    });

    await expect(chatAttachmentRepository.get(id)).resolves.toMatchObject({ id });
    await chatAttachmentRepository.delete(id);
  });

  it('stores pending images in memory without requiring IndexedDB', async () => {
    const requestId = 'native-image';
    await pendingImageRepository.put({
      requestId,
      storyId: 'story-native',
      purpose: 'background',
      prompt: 'forest',
      mimeType: 'image/png',
      blob: new Blob(['image'], { type: 'image/png' }),
      createdAt: Date.now(),
    });

    await expect(pendingImageRepository.get(requestId)).resolves.toMatchObject({ requestId });
    await pendingImageRepository.delete(requestId);
  });
});
