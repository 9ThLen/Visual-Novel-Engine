import { Platform } from 'react-native';

const { getDocumentAsync } = vi.hoisted(() => ({ getDocumentAsync: vi.fn() }));

vi.mock('expo-document-picker', () => ({ getDocumentAsync }));

describe('native video picker', () => {
  beforeEach(() => {
    (Platform as { OS: string }).OS = 'android';
    getDocumentAsync.mockReset();
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = 'web';
  });

  it('requests provider metadata without copying the clip into Expo cache', async () => {
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'content://provider/intro',
        name: 'intro.mp4',
        size: 1024,
        mimeType: 'video/mp4',
      }],
    });
    const { pickVideoFromDevice } = await import('@/lib/pick-video');

    await expect(pickVideoFromDevice()).resolves.toMatchObject({ status: 'picked' });
    expect(getDocumentAsync).toHaveBeenCalledWith({
      type: 'video/mp4',
      copyToCacheDirectory: false,
      multiple: false,
    });
  });

  it('uses the MP4 extension when a provider reports a generic MIME type', async () => {
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'content://provider/intro',
        name: 'intro.mp4',
        size: 1024,
        mimeType: 'application/octet-stream',
      }],
    });
    const { pickVideoFromDevice } = await import('@/lib/pick-video');

    await expect(pickVideoFromDevice()).resolves.toMatchObject({
      status: 'picked',
      video: { mimeType: 'video/mp4' },
    });
  });
});
