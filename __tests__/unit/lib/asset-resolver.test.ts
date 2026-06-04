import { resolveAssetUri, clearUriCache } from '@/lib/asset-resolver';

describe('asset resolver', () => {
  beforeEach(() => {
    clearUriCache();
  });

  it('allows safe non-svg data image uris', async () => {
    const uri = 'data:image/png;base64,AAAA';

    await expect(resolveAssetUri(uri)).resolves.toBe(uri);
  });

  it('blocks svg data uris', async () => {
    await expect(resolveAssetUri('data:image/svg+xml;base64,PHN2Zy8+')).resolves.toBeNull();
  });
});
