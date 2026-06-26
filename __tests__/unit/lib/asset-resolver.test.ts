import { resolveAssetUri, clearUriCache } from '@/lib/asset-resolver';
import { useAppStore, resetAppStoreState } from '../../../__mocks__/stores/use-app-store';

describe('asset resolver', () => {
  beforeEach(() => {
    resetAppStoreState();
    clearUriCache();
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
});
