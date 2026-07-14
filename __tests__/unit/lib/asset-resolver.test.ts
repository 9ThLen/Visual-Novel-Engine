import { resolveAssetUri, clearUriCache } from '@/lib/asset-resolver';
import * as IdbStorage from '@/lib/idb-storage';
import { useAppStore, resetAppStoreState } from '../../../__mocks__/stores/use-app-store';

const getMediaBlobMock = vi.fn();

describe('asset resolver', () => {
  beforeEach(() => {
    resetAppStoreState();
    clearUriCache();
    vi.clearAllMocks();
    getMediaBlobMock.mockResolvedValue(null);
    IdbStorage.setMediaBlobStorageAdapterForTests({ get: getMediaBlobMock });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:resolved-media'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('allows safe non-svg data image uris', async () => {
    const uri = 'data:image/png;base64,AAAA';

    await expect(resolveAssetUri(uri)).resolves.toBe(uri);
  });

  it('blocks svg data uris', async () => {
    await expect(resolveAssetUri('data:image/svg+xml;base64,PHN2Zy8+')).resolves.toBeNull();
  });

  it('resolves media-library asset ids before URI safety validation', async () => {
    const uri = 'data:image/png;base64,AAAA';
    useAppStore.setState({
      mediaLibrary: [{
        id: 'asset-1',
        uri,
        type: 'image',
        name: 'background.png',
        addedAt: 1,
      }],
    });

    await expect(resolveAssetUri('asset-1')).resolves.toBe(uri);
  });

  it('blocks unknown plain asset ids', async () => {
    await expect(resolveAssetUri('missing-asset')).resolves.toBeNull();
  });

  it('resolves IndexedDB media references once and caches the object URL', async () => {
    getMediaBlobMock.mockResolvedValue(new Blob(['ABC'], { type: 'image/png' }));
    useAppStore.setState({
      mediaLibrary: [{
        id: 'asset-idb',
        uri: 'idb://media/blob-key',
        type: 'image',
        name: 'background.png',
        addedAt: 1,
      }],
    });

    await expect(resolveAssetUri('asset-idb')).resolves.toBe('blob:resolved-media');
    await expect(resolveAssetUri('idb://media/blob-key')).resolves.toBe('blob:resolved-media');
    expect(getMediaBlobMock).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('revokes generated object URLs when the resolver cache is cleared', async () => {
    getMediaBlobMock.mockResolvedValue(new Blob(['ABC'], { type: 'audio/mpeg' }));
    await resolveAssetUri('idb://media/audio-key');

    clearUriCache();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:resolved-media');
  });

  afterAll(() => {
    IdbStorage.setMediaBlobStorageAdapterForTests(null);
  });
});
