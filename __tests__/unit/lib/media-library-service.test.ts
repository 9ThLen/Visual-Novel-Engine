import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({
  default: {},
  documentDirectory: 'file:///documents/',
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  copyAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  EncodingType: { Base64: 'base64' },
}));

vi.mock('@/stores/use-app-store', () => ({
  useAppStore: {
    getState: () => ({
      mediaLibrary: [],
      setMediaLibrary: vi.fn(),
    }),
  },
}));

import type { LibraryAsset } from '@/lib/media-library-service';
import { resolveLibraryAssetUri } from '@/lib/media-library-service';

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
});
