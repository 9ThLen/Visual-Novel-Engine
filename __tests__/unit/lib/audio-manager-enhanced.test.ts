import { createEnhancedAudioManager } from '@/lib/audio-manager-enhanced';
import {
  activateReaderAudioSession,
  deactivateReaderAudioSession,
} from '@/lib/reader-audio-session';
import type { IAudioLibraryService, IAudioPlayerService } from '@/lib/audio-interfaces';
import type { AudioLibraryItem } from '@/lib/audio-types';

const music: AudioLibraryItem = {
  id: 'music-1',
  name: 'Theme',
  uri: 'theme.mp3',
  type: 'music',
  loop: true,
  volume: 0.8,
  tags: [],
  createdAt: 1,
};

function createPlayer(): IAudioPlayerService {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    stopAll: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn().mockResolvedValue(undefined),
    isPlaying: vi.fn().mockReturnValue(false),
    crossFade: vi.fn().mockResolvedValue(undefined),
    getActiveTrackIds: vi.fn().mockReturnValue([]),
    getTrackMetadata: vi.fn(),
    getAllActiveTracks: vi.fn().mockReturnValue([
      {
        trackId: 'bgm',
        isPlaying: true,
        volume: 0.8,
        loop: true,
        startTime: 1,
        metadata: { audioId: 'music-1' },
      },
    ]),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

function createLibrary(): IAudioLibraryService {
  const items = new Map<string, AudioLibraryItem>();
  return {
    load: vi.fn((nextItems: AudioLibraryItem[]) => {
      items.clear();
      for (const item of nextItems) items.set(item.id, item);
    }),
    get: vi.fn((id: string) => items.get(id)),
    getByType: vi.fn(),
    set: vi.fn((item: AudioLibraryItem) => items.set(item.id, item)),
    remove: vi.fn((id: string) => items.delete(id)),
    getAll: vi.fn(() => [...items.values()]),
    clear: vi.fn(() => items.clear()),
    get size() {
      return items.size;
    },
  };
}

describe('EnhancedAudioManager', () => {
  beforeEach(() => {
    deactivateReaderAudioSession();
  });

  it('delegates library and active-track lookups to injected services', () => {
    const player = createPlayer();
    const library = createLibrary();
    const manager = createEnhancedAudioManager(player, library);

    manager.loadLibrary([music]);

    expect(manager.getLibraryItem('music-1')).toEqual(music);
    expect(manager.getActiveTracksByType('music')).toEqual(['bgm']);
  });

  it('guards reader-only playback methods when no reader audio session is active', async () => {
    const player = createPlayer();
    const manager = createEnhancedAudioManager(player, createLibrary());

    await manager.play('bgm', 'theme.mp3');
    await manager.crossFade('bgm', 'next.mp3');

    expect(player.play).not.toHaveBeenCalled();
    expect(player.crossFade).not.toHaveBeenCalled();
  });

  it('allows guarded playback when a reader audio session is active', async () => {
    const player = createPlayer();
    const manager = createEnhancedAudioManager(player, createLibrary());

    activateReaderAudioSession();
    await manager.play('bgm', 'theme.mp3', { volume: 0.5, loop: true });
    await manager.crossFade('bgm', 'next.mp3', { duration: 300 });

    expect(player.play).toHaveBeenCalledWith('bgm', 'theme.mp3', {
      volume: 0.5,
      loop: true,
      fadeIn: undefined,
      metadata: { audioId: undefined, triggerId: undefined },
    });
    expect(player.crossFade).toHaveBeenCalledWith('bgm', 'next.mp3', { duration: 300 });
  });
});
