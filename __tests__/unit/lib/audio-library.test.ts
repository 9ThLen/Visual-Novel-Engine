import { describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/use-app-store', () => ({
  useAppStore: {
    getState: () => ({
      mediaLibrary: [],
      audioLibraries: {},
      setAudioLibrary: vi.fn(),
    }),
  },
}));

import type { AudioLibraryItem } from '@/lib/audio-types';
import type { LibraryAsset } from '@/lib/media-library-service';
import { buildPlaybackAudioLibraryItems } from '@/lib/audio-library';

function makeAudioItem(overrides: Partial<AudioLibraryItem> = {}): AudioLibraryItem {
  return {
    id: 'story-audio-1',
    name: 'Story Audio',
    type: 'music',
    uri: 'file:///story/music.mp3',
    loop: true,
    volume: 0.8,
    createdAt: 1,
    ...overrides,
  };
}

function makeMediaAsset(overrides: Partial<LibraryAsset> = {}): LibraryAsset {
  return {
    id: 'media-audio-1',
    uri: 'file:///library/click.mp3',
    type: 'audio',
    name: 'click-sfx.mp3',
    addedAt: 2,
    ...overrides,
  };
}

describe('audio-library', () => {
  it('merges story audio library items with media-library audio assets for playback', () => {
    const playbackLibrary = buildPlaybackAudioLibraryItems(
      [makeAudioItem()],
      [
        makeMediaAsset(),
        makeMediaAsset({
          id: 'bgm-1',
          name: 'intro-theme.mp3',
          uri: 'file:///library/intro-theme.mp3',
        }),
      ]
    );

    expect(playbackLibrary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'story-audio-1', uri: 'file:///story/music.mp3' }),
        expect.objectContaining({ id: 'media-audio-1', uri: 'file:///library/click.mp3', type: 'sfx' }),
        expect.objectContaining({ id: 'bgm-1', uri: 'file:///library/intro-theme.mp3', type: 'music' }),
      ])
    );
  });

  it('keeps explicit story library items authoritative when ids overlap', () => {
    const playbackLibrary = buildPlaybackAudioLibraryItems(
      [
        makeAudioItem({
          id: 'shared-id',
          uri: 'file:///story/authoritative.mp3',
          type: 'voice',
        }),
      ],
      [
        makeMediaAsset({
          id: 'shared-id',
          uri: 'file:///library/fallback.mp3',
          name: 'fallback.mp3',
        }),
      ]
    );

    expect(playbackLibrary).toContainEqual(
      expect.objectContaining({
        id: 'shared-id',
        uri: 'file:///story/authoritative.mp3',
        type: 'voice',
      })
    );
    expect(playbackLibrary.filter((item) => item.id === 'shared-id')).toHaveLength(1);
  });
});
