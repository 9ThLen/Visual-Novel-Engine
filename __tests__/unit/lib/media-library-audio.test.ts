/**
 * A sound picked off the device keeps an identity of its own.
 *
 * Two folders can each hold a `track.mp3`, and the library used to merge them
 * on the name alone — the second import returned the first asset and the new
 * file was dropped. The exception the video path already had now covers audio
 * too, with one difference: a data URI is stored under the hash of its own
 * bytes, so identical content there really is the same asset.
 */
import {
  MAX_AUDIO_ASSET_BYTES,
  addAssetToLibraryPure,
  isSupportedAudioMimeType,
  type LibraryAsset,
} from '@/lib/media-library-service';
import { setMediaBlobStorageAdapterForTests } from '@/lib/idb-storage';
import {
  mockCopyAsync,
  mockGetInfoAsync,
  mockMakeDirectoryAsync,
  mockReadAsStringAsync,
} from '../../../__mocks__/expo-file-system-legacy';
import { Platform } from 'react-native';

describe('audio asset import', () => {
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
    mockGetInfoAsync.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts what expo-audio can play and nothing else', () => {
    expect(isSupportedAudioMimeType('audio/mpeg')).toBe(true);
    expect(isSupportedAudioMimeType('audio/mp4')).toBe(true);
    expect(isSupportedAudioMimeType('audio/wav; codecs=1')).toBe(true);
    expect(isSupportedAudioMimeType('audio/flac')).toBe(false);
    expect(isSupportedAudioMimeType(undefined)).toBe(false);
  });

  it('rejects a track too large to survive a backup', async () => {
    await expect(
      addAssetToLibraryPure('file:///cache/huge.mp3', 'huge.mp3', 'audio', [], {
        mimeType: 'audio/mpeg',
        size: MAX_AUDIO_ASSET_BYTES + 1,
      }),
    ).rejects.toThrow(/exceeds/i);
  });

  it('keeps two sounds that merely share a name apart', async () => {
    Platform.OS = 'web';
    const existing: LibraryAsset[] = [{
      id: 'asset_a',
      type: 'audio',
      // In the library directory and present on disk, which is exactly the
      // state in which the name-based merge used to fire.
      uri: 'file:///documents/media-library/audios/track.mp3',
      name: 'track.mp3',
      size: 2048,
      addedAt: 1,
    }];
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 2048 });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array(2048)], { type: 'audio/mpeg' }),
    })));

    const result = await addAssetToLibraryPure('blob:other', 'track.mp3', 'audio', existing, {
      mimeType: 'audio/mpeg',
      size: 2048,
    });

    // Merging them would have swapped one sound for another in every scene
    // that goes on to reference the "new" one.
    expect(result.asset.id).not.toBe('asset_a');
    expect(result.assets).toHaveLength(2);
  });

  // The editor uploads audio as a data URI, which is stored under the hash of
  // its bytes. There sameness is provable, so the merge is right.
  it('still merges a re-uploaded data URI with the asset it already made', async () => {
    Platform.OS = 'web';
    const first = await addAssetToLibraryPure(
      'data:audio/mpeg;base64,QUJD',
      'sting.mp3',
      'audio',
      [],
    );

    const again = await addAssetToLibraryPure(
      'data:audio/mpeg;base64,QUJD',
      'sting.mp3',
      'audio',
      first.assets,
    );

    expect(again.asset).toBe(first.asset);
    expect(again.assets).toHaveLength(1);
  });

  describe('native copy path', () => {
    beforeEach(() => {
      (Platform as { OS: string }).OS = 'ios';
      mockCopyAsync.mockReset();
      mockGetInfoAsync.mockReset();
      mockMakeDirectoryAsync.mockReset();
      mockReadAsStringAsync.mockReset();
      mockMakeDirectoryAsync.mockResolvedValue(undefined);
      mockCopyAsync.mockResolvedValue(undefined);
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

    it('gives each imported sound its own file, even with identical names', async () => {
      stageCopy(1024);

      const first = await addAssetToLibraryPure('file:///cache/a.mp3', 'track.mp3', 'audio', [], {
        mimeType: 'audio/mpeg',
      });

      // Without the asset id in the target name, a second track.mp3 would find
      // this file already in place and silently adopt its bytes.
      expect(first.asset.uri).toContain(first.asset.id);
      expect(first.asset.uri.endsWith('/track.mp3')).toBe(false);

      stageCopy(2048);
      const second = await addAssetToLibraryPure('file:///cache/b.mp3', 'track.mp3', 'audio', first.assets, {
        mimeType: 'audio/mpeg',
      });

      expect(second.asset.id).not.toBe(first.asset.id);
      expect(second.asset.uri).not.toBe(first.asset.uri);
      expect(second.assets).toHaveLength(2);
    });

    // Not a regression guard for audio alone: the same name-based merge still
    // has to work for images, which are not picked file-by-file.
    it('leaves the image merge alone', async () => {
      const existing: LibraryAsset[] = [{
        id: 'asset_img',
        type: 'image',
        uri: 'file:///documents/media-library/images/bg.png',
        name: 'bg.png',
        addedAt: 1,
      }];
      mockGetInfoAsync.mockResolvedValue({ exists: true, size: 512 });

      const result = await addAssetToLibraryPure('file:///cache/bg.png', 'bg.png', 'image', existing);

      expect(result.asset).toBe(existing[0]);
      expect(result.assets).toHaveLength(1);
    });
  });
});
