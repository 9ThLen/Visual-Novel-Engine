import type { LibraryAsset } from '@/lib/media-library-service';
import { addAssetToLibraryPure, resolveLibraryAssetUri } from '@/lib/media-library-service';
import * as FileSystem from 'expo-file-system/legacy';
import * as IdbStorage from '@/lib/idb-storage';
import { Platform } from 'react-native';

const idbMocks = {
  has: vi.fn(),
  put: vi.fn(),
};

const mockFileSystem = FileSystem as typeof FileSystem & {
  mockGetInfoAsync: ReturnType<typeof vi.fn>;
  mockMakeDirectoryAsync: ReturnType<typeof vi.fn>;
  mockCopyAsync: ReturnType<typeof vi.fn>;
  mockReadAsStringAsync: ReturnType<typeof vi.fn>;
  mockWriteAsStringAsync: ReturnType<typeof vi.fn>;
  mockSetDocumentDirectory: (value: string | null) => void;
};

function makeAsset(overrides: Partial<LibraryAsset> = {}): LibraryAsset {
  return {
    id: 'asset-1',
    uri: 'file:///media/background.png',
    type: 'image',
    name: 'background.png',
    addedAt: 1,
    ...overrides,
  };
}

describe('media-library-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Platform.OS = 'ios';
    mockFileSystem.mockSetDocumentDirectory('file:///documents/');
    idbMocks.has.mockResolvedValue(false);
    idbMocks.put.mockResolvedValue(undefined);
    IdbStorage.setMediaBlobStorageAdapterForTests(idbMocks);
  });

  afterAll(() => {
    IdbStorage.setMediaBlobStorageAdapterForTests(null);
    Platform.OS = 'web';
  });

  it('resolves stored media-library asset ids to playable uris', () => {
    const assets = [
      makeAsset(),
      makeAsset({
        id: 'audio-1',
        uri: 'file:///media/music.mp3',
        type: 'audio',
        name: 'music.mp3',
      }),
    ];

    expect(resolveLibraryAssetUri('asset-1', assets)).toBe('file:///media/background.png');
    expect(resolveLibraryAssetUri('audio-1', assets)).toBe('file:///media/music.mp3');
  });

  it('returns the original reference when it is already a uri-like value', () => {
    const assets = [makeAsset()];

    expect(resolveLibraryAssetUri('file:///custom/image.png', assets)).toBe('file:///custom/image.png');
    expect(resolveLibraryAssetUri('https://cdn.example.com/image.png', assets)).toBe('https://cdn.example.com/image.png');
  });

  it('returns null for unknown asset ids', () => {
    expect(resolveLibraryAssetUri('missing-id', [makeAsset()])).toBeNull();
  });

  it('writes base64 data image uploads to the media library directory on native', async () => {
    mockFileSystem.mockGetInfoAsync
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ exists: true, size: 3 });

    const result = await addAssetToLibraryPure(
      'data:image/png;base64,QUJD',
      'background.png',
      'image',
      [],
    );

    expect(result.asset.uri).toMatch(/^file:\/\/\/documents\/media-library\/images\/[a-f0-9]+\.png$/);
    expect(result.asset.name).toBe('background.png');
    expect(mockFileSystem.mockMakeDirectoryAsync).toHaveBeenCalledWith(
      'file:///documents/media-library/images/',
      { intermediates: true },
    );
    expect(mockFileSystem.mockWriteAsStringAsync).toHaveBeenCalledWith(
      result.asset.uri,
      'QUJD',
      { encoding: FileSystem.EncodingType.Base64 },
    );
    expect(mockFileSystem.mockCopyAsync).not.toHaveBeenCalled();
    expect(mockFileSystem.mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it('keeps data image uploads as data uris when the native document directory is unavailable', async () => {
    mockFileSystem.mockSetDocumentDirectory(null);

    const result = await addAssetToLibraryPure(
      'data:image/png;base64,QUJD',
      'background.png',
      'image',
      [],
    );

    expect(result.asset.uri).toBe('data:image/png;base64,QUJD');
    expect(mockFileSystem.mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockFileSystem.mockCopyAsync).not.toHaveBeenCalled();
  });

  it('reuses an existing content-addressed data image asset', async () => {
    mockFileSystem.mockGetInfoAsync
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ exists: true, size: 3 });

    const first = await addAssetToLibraryPure(
      'data:image/png;base64,QUJD',
      'background.png',
      'image',
      [],
    );

    vi.clearAllMocks();
    const second = await addAssetToLibraryPure(
      'data:image/png;base64,QUJD',
      'other-name.png',
      'image',
      first.assets,
    );

    expect(second.asset).toBe(first.asset);
    expect(second.assets).toBe(first.assets);
    expect(mockFileSystem.mockWriteAsStringAsync).not.toHaveBeenCalled();
  });

  it('stores web data URI uploads as IndexedDB Blobs', async () => {
    Platform.OS = 'web';
    mockFileSystem.mockSetDocumentDirectory(null);

    const result = await addAssetToLibraryPure(
      'data:image/png;base64,QUJD',
      'background.png',
      'image',
      [],
    );

    expect(result.asset.uri).toMatch(/^idb:\/\/media\/[a-f0-9]+$/);
    expect(result.asset.uri).not.toContain('data:');
    expect(idbMocks.put).toHaveBeenCalledOnce();
    const [, blob] = idbMocks.put.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob).toMatchObject({ size: 3, type: 'image/png' });
    expect(mockFileSystem.mockWriteAsStringAsync).not.toHaveBeenCalled();
  });

  it('stores web data URI uploads larger than the legacy 256 KB cap', async () => {
    Platform.OS = 'web';
    mockFileSystem.mockSetDocumentDirectory(null);
    const base64 = 'QUJD'.repeat(100_000);

    const result = await addAssetToLibraryPure(
      `data:image/png;base64,${base64}`,
      'large-background.png',
      'image',
      [],
    );

    expect(result.asset.uri).toMatch(/^idb:\/\/media\/[a-f0-9]+$/);
    const [, blob] = idbMocks.put.mock.calls[0];
    expect(blob).toMatchObject({ size: 300_000, type: 'image/png' });
  });

  it('reuses the content-addressed web asset without rewriting its Blob', async () => {
    Platform.OS = 'web';
    mockFileSystem.mockSetDocumentDirectory(null);
    const first = await addAssetToLibraryPure(
      'data:image/png;base64,QUJD',
      'background.png',
      'image',
      [],
    );
    vi.clearAllMocks();
    idbMocks.has.mockResolvedValue(true);

    const second = await addAssetToLibraryPure(
      'data:image/png;base64,QUJD',
      'duplicate.png',
      'image',
      first.assets,
    );

    expect(second.asset).toBe(first.asset);
    expect(second.assets).toBe(first.assets);
    expect(idbMocks.put).not.toHaveBeenCalled();
  });

  it('repairs a missing IndexedDB Blob when matching metadata already exists', async () => {
    Platform.OS = 'web';
    const first = await addAssetToLibraryPure(
      'data:image/png;base64,QUJD',
      'background.png',
      'image',
      [],
    );
    vi.clearAllMocks();
    idbMocks.has.mockResolvedValue(false);

    const repaired = await addAssetToLibraryPure(
      'data:image/png;base64,QUJD',
      'replacement.png',
      'image',
      first.assets,
    );

    expect(repaired.asset).toBe(first.asset);
    expect(idbMocks.put).toHaveBeenCalledOnce();
  });

  it('copies temporary web Blob URLs into stable IndexedDB references', async () => {
    Platform.OS = 'web';
    const sourceBlob = new Blob(['audio'], { type: 'audio/mpeg' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: async () => sourceBlob,
    } as Response);

    const result = await addAssetToLibraryPure(
      'blob:https://example.test/temporary',
      'voice.mp3',
      'audio',
      [],
    );

    expect(fetchSpy).toHaveBeenCalledWith('blob:https://example.test/temporary');
    expect(result.asset.uri).toMatch(/^idb:\/\/media\//);
    expect(result.asset.uri).not.toContain('temporary');
    expect(idbMocks.put).toHaveBeenCalledWith(expect.any(String), sourceBlob);
  });

  it('rejects unsafe SVG data uploads before writing a Blob', async () => {
    Platform.OS = 'web';

    await expect(addAssetToLibraryPure(
      'data:image/svg+xml;base64,PHN2Zy8+',
      'unsafe.svg',
      'image',
      [],
    )).rejects.toThrow('Invalid image data URI');
    expect(idbMocks.put).not.toHaveBeenCalled();
  });
});
