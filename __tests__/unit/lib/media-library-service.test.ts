import type { LibraryAsset } from '@/lib/media-library-service';
import { addAssetToLibraryPure, resolveLibraryAssetUri } from '@/lib/media-library-service';
import * as FileSystem from 'expo-file-system/legacy';

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
    mockFileSystem.mockSetDocumentDirectory('file:///documents/');
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

  it('keeps data image uploads as data uris when no document directory is available', async () => {
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
});
