import { acquireResolvedAssetUri, resolveAssetUri, resolvePlayableAssetUri, resetAssetResolverForTests } from '@/lib/asset-resolver';
import * as IdbStorage from '@/lib/idb-storage';
import { useAppStore, resetAppStoreState } from '../../../__mocks__/stores/use-app-store';

const getMediaBlobMock = vi.fn();

describe('asset resolver', () => {
  beforeEach(() => {
    resetAppStoreState();
    resetAssetResolverForTests();
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

  it('does not pretend an unknown bundled path is runtime-reachable', async () => {
    await expect(resolveAssetUri('assets/images/not-emitted.png')).resolves.toBeNull();
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

    resetAssetResolverForTests();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:resolved-media');
  });

  describe('object URL leases', () => {
    /** Fills the object-URL cache with `count` distinct IndexedDB-backed blobs. */
    async function resolveManyDistinctBlobs(count: number, startAt = 0) {
      for (let index = startAt; index < startAt + count; index += 1) {
        await resolveAssetUri(`idb://media/filler-${index}`);
      }
    }

    beforeEach(() => {
      getMediaBlobMock.mockResolvedValue(new Blob(['ABC'], { type: 'video/mp4' }));
      let counter = 0;
      (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        () => `blob:generated-${counter++}`,
      );
    });

    it('does not revoke a leased URL under cache pressure', async () => {
      const lease = await acquireResolvedAssetUri('idb://media/pinned');
      expect(lease.source).toBe('blob:generated-0');

      // Well past the 100-entry limit, so an unleased URL would be long gone.
      await resolveManyDistinctBlobs(150);

      expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:generated-0');
      await expect(resolveAssetUri('idb://media/pinned')).resolves.toBe('blob:generated-0');
    });

    it('lets the URL be evicted once the lease is released', async () => {
      const lease = await acquireResolvedAssetUri('idb://media/pinned');
      lease.release();

      await resolveManyDistinctBlobs(150);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:generated-0');
    });

    it('is safe to release twice', async () => {
      const first = await acquireResolvedAssetUri('idb://media/pinned');
      const second = await acquireResolvedAssetUri('idb://media/pinned');
      first.release();
      first.release();

      // The second lease still holds the pin: a double release must not drop it.
      await resolveManyDistinctBlobs(150);
      expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:generated-0');

      second.release();
      await resolveManyDistinctBlobs(150, 200);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:generated-0');
    });

    // The URI caches are keyed by resolver input while object URLs are keyed by
    // storage key, and `playableUriCache` has its own eviction budget: a blob
    // resolved once for audio survives there long after 100 video resolves have
    // revoked its URL. Without the alias index that cache keeps replaying the
    // dead URL for the whole TTL, which is what makes a naive retry useless.
    it('invalidates every alias of a revoked URL across both URI caches', async () => {
      useAppStore.setState({
        mediaLibrary: [{
          id: 'asset-aliased',
          uri: 'idb://media/aliased',
          type: 'audio',
          name: 'theme.mp3',
          addedAt: 1,
        }],
      });

      await expect(resolvePlayableAssetUri('idb://media/aliased')).resolves.toBe('blob:generated-0');
      await expect(resolveAssetUri('asset-aliased')).resolves.toBe('blob:generated-0');
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

      await resolveManyDistinctBlobs(150);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:generated-0');

      // Both caches must re-resolve rather than replay the revoked URL.
      await expect(resolvePlayableAssetUri('idb://media/aliased')).resolves.not.toBe('blob:generated-0');
      await expect(resolveAssetUri('asset-aliased')).resolves.not.toBe('blob:generated-0');
    });

    // Two aliases of one blob resolving at the same time must share a single
    // read; otherwise the loser's URL is never revoked and never reachable.
    it('creates one object URL when two aliases resolve concurrently', async () => {
      useAppStore.setState({
        mediaLibrary: [{
          id: 'asset-race',
          uri: 'idb://media/race',
          type: 'video',
          name: 'clip.mp4',
          addedAt: 1,
        }],
      });
      let releaseBlob: ((blob: Blob) => void) | undefined;
      getMediaBlobMock.mockImplementation(() => new Promise((resolve) => {
        releaseBlob = resolve;
      }));

      const first = resolveAssetUri('asset-race');
      const second = resolveAssetUri('idb://media/race');
      releaseBlob?.(new Blob(['ABC'], { type: 'video/mp4' }));

      expect(await first).toBe('blob:generated-0');
      expect(await second).toBe('blob:generated-0');
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });

    // Leases can push the cache past its limit; once released it has to come
    // back down instead of holding its peak until a full reset.
    it('drains back to the limit once the leases are gone', async () => {
      const leases = [];
      for (let index = 0; index < 130; index += 1) {
        leases.push(await acquireResolvedAssetUri(`idb://media/leased-${index}`));
      }
      const peak = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(peak).toBe(130);

      leases.forEach((lease) => lease.release());
      await resolveAssetUri('idb://media/after-release');

      // 130 held + 1 new, drained to just under the 100 limit.
      const revoked = (URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(revoked).toBe(31);
    });

    it('warns once when every candidate is leased and the cache is over its limit', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const leases = [];
      for (let index = 0; index < 130; index += 1) {
        leases.push(await acquireResolvedAssetUri(`idb://media/leased-${index}`));
      }

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('leased');

      // A successful eviction re-arms the warning for the next episode.
      leases[0].release();
      await resolveManyDistinctBlobs(1, 500);
      for (let index = 0; index < 5; index += 1) {
        leases.push(await acquireResolvedAssetUri(`idb://media/leased-extra-${index}`));
      }
      expect(warn).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });
  });

  afterAll(() => {
    IdbStorage.setMediaBlobStorageAdapterForTests(null);
  });
});
