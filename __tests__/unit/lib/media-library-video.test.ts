import {
  MAX_VIDEO_ASSET_BYTES,
  addAssetToLibraryPure,
  canConvertDataUri,
  isSupportedVideoMimeType,
  type LibraryAsset,
} from '@/lib/media-library-service';
import { setMediaBlobStorageAdapterForTests } from '@/lib/idb-storage';
import {
  mockCopyAsync,
  mockDeleteAsync,
  mockGetInfoAsync,
  mockMakeDirectoryAsync,
  mockReadAsStringAsync,
} from '../../../__mocks__/expo-file-system-legacy';
import { Platform } from 'react-native';

function makeVideoBlob(bytes: number, type = 'video/mp4'): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

describe('video asset import', () => {
  const stored = new Map<string, Blob>();

  beforeEach(() => {
    stored.clear();
    setMediaBlobStorageAdapterForTests({
      get: async (key) => stored.get(key) ?? null,
      has: async (key) => stored.has(key),
      put: async (key, blob) => { stored.set(key, blob); },
      delete: async (key) => { stored.delete(key); },
    });
  });

  afterEach(() => {
    setMediaBlobStorageAdapterForTests(null);
    vi.unstubAllGlobals();
  });

  it('only promises MP4', () => {
    expect(isSupportedVideoMimeType('video/mp4')).toBe(true);
    expect(isSupportedVideoMimeType('video/mp4; codecs="avc1"')).toBe(true);
    expect(isSupportedVideoMimeType('video/webm')).toBe(false);
    expect(isSupportedVideoMimeType(undefined)).toBe(false);
  });

  it('refuses to treat a video as an inline data URI', () => {
    // Decoding a clip into base64 is what would blow the JS heap on mobile,
    // so the conversion path has to stay closed for video.
    expect(canConvertDataUri('data:video/mp4;base64,AAAA', 'video')).toBe(false);
    expect(canConvertDataUri('data:image/png;base64,AAAA', 'image')).toBe(true);
  });

  it('rejects a data URI import outright', async () => {
    await expect(
      addAssetToLibraryPure('data:video/mp4;base64,AAAA', 'clip.mp4', 'video', []),
    ).rejects.toThrow(/data URI/i);
  });

  it('rejects an oversized clip before any bytes are read', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      addAssetToLibraryPure('blob:huge', 'huge.mp4', 'video', [], {
        mimeType: 'video/mp4',
        size: MAX_VIDEO_ASSET_BYTES + 1,
      }),
    ).rejects.toThrow(/exceeds/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('persists a picked clip as a blob and records its mime type and size', async () => {
    const blob = makeVideoBlob(2048);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => blob })));

    const result = await addAssetToLibraryPure('blob:clip', 'Intro.mp4', 'video', [], {
      mimeType: 'video/mp4',
      size: 2048,
    });

    expect(result.asset.type).toBe('video');
    expect(result.asset.uri.startsWith('idb://media/')).toBe(true);
    expect(result.asset.mimeType).toBe('video/mp4');
    expect(result.asset.size).toBe(2048);
    expect(stored.size).toBe(1);
  });

  it('rejects a non-MP4 blob even when the picker was bypassed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => makeVideoBlob(64, 'video/webm') })));

    await expect(
      addAssetToLibraryPure('blob:clip', 'clip.webm', 'video', []),
    ).rejects.toThrow(/Invalid video upload/i);
  });

  describe('native copy path', () => {
    beforeEach(() => {
      (Platform as { OS: string }).OS = 'ios';
      mockCopyAsync.mockReset();
      mockDeleteAsync.mockReset();
      mockGetInfoAsync.mockReset();
      mockMakeDirectoryAsync.mockReset();
      mockReadAsStringAsync.mockReset();
      mockMakeDirectoryAsync.mockResolvedValue(undefined);
      mockCopyAsync.mockResolvedValue(undefined);
      mockDeleteAsync.mockResolvedValue(undefined);
    });

    afterEach(() => {
      (Platform as { OS: string }).OS = 'web';
    });

    /**
     * getInfoAsync is asked twice: once to see whether the target is already
     * there, and once to verify the copy. Only the second call should report a
     * file, so the mock follows the copy.
     */
    function stageCopy(sizeAfterCopy: number) {
      let copied = false;
      mockCopyAsync.mockImplementation(async () => { copied = true; });
      mockGetInfoAsync.mockImplementation(async (path: string) => (
        copied && path.startsWith('file:///documents/')
          ? { exists: true, size: sizeAfterCopy }
          : { exists: false, size: 0 }
      ));
    }

    it('gives each imported clip its own file, even with identical names', async () => {
      stageCopy(1024);

      const first = await addAssetToLibraryPure('file:///cache/a.mp4', 'Intro.mp4', 'video', [], {
        mimeType: 'video/mp4',
      });

      expect(mockCopyAsync).toHaveBeenCalled();
      // Without the asset id in the target name, a second Intro.mp4 would find
      // this file already in place and silently alias its bytes.
      expect(first.asset.uri).toContain(first.asset.id);
      expect(first.asset.uri.endsWith('/Intro.mp4')).toBe(false);

      stageCopy(2048);
      const second = await addAssetToLibraryPure('file:///cache/b.mp4', 'Intro.mp4', 'video', first.assets, {
        mimeType: 'video/mp4',
      });

      expect(second.asset.id).not.toBe(first.asset.id);
      expect(second.asset.uri).not.toBe(first.asset.uri);
    });

    it('measures the copied file and rejects one that is over the limit', async () => {
      // The picker reported no size at all — the copied bytes are the only
      // measure that cannot lie.
      stageCopy(MAX_VIDEO_ASSET_BYTES + 1);

      await expect(
        addAssetToLibraryPure('file:///cache/huge.mp4', 'huge.mp4', 'video', [], { mimeType: 'video/mp4' }),
      ).rejects.toThrow(/exceeds/i);
      expect(mockDeleteAsync).toHaveBeenCalled();
    });

    it('rejects a non-MP4 file before the native copy starts', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false, size: 0 });

      await expect(
        addAssetToLibraryPure('file:///cache/clip.webm', 'clip.webm', 'video', [], {
          mimeType: 'video/webm',
          size: 1024,
        }),
      ).rejects.toThrow(/only MP4/i);
      expect(mockCopyAsync).not.toHaveBeenCalled();

      await expect(
        addAssetToLibraryPure('content://provider/clip', 'clip.webm', 'video', [], { size: 1024 }),
      ).rejects.toThrow(/only MP4/i);
      expect(mockCopyAsync).not.toHaveBeenCalled();
    });

    it('records the measured size of an accepted clip', async () => {
      stageCopy(4096);

      const result = await addAssetToLibraryPure('file:///cache/ok.mp4', 'ok.mp4', 'video', [], {
        mimeType: 'video/mp4',
      });

      expect(result.asset.size).toBe(4096);
    });

    it('never falls back to reading a failed copy as base64', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false, size: 0 });
      mockCopyAsync.mockRejectedValue(new Error('disk full'));

      await expect(
        addAssetToLibraryPure('file:///cache/x.mp4', 'x.mp4', 'video', [], { mimeType: 'video/mp4' }),
      ).rejects.toThrow(/disk full/i);
      expect(mockReadAsStringAsync).not.toHaveBeenCalled();
      expect(mockDeleteAsync).toHaveBeenCalled();
    });
  });

  it('keeps two clips that merely share a name and size apart', async () => {
    const existing: LibraryAsset[] = [
      { id: 'asset_a', type: 'video', uri: 'idb://media/a', name: 'Intro.mp4', size: 2048, addedAt: 1 },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => makeVideoBlob(2048) })));

    const result = await addAssetToLibraryPure('blob:other', 'Intro.mp4', 'video', existing, {
      mimeType: 'video/mp4',
      size: 2048,
    });

    // Same name and size is a duplicate hint for the UI, never proof of
    // sameness — merging them would silently swap one clip for another.
    expect(result.asset.id).not.toBe('asset_a');
    expect(result.assets).toHaveLength(2);
  });
});
