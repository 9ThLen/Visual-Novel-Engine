import { AudioTriggerScheduler } from '@/lib/audio-trigger-scheduler';
import type { IAudioLibraryService, IAudioPlayerService } from '@/lib/audio-interfaces';
import type { AudioLibraryItem } from '@/lib/audio-types';

const item: AudioLibraryItem = {
  id: 'sfx-door',
  name: 'Door',
  uri: 'door.mp3',
  type: 'sfx',
  loop: false,
  volume: 0.4,
  tags: [],
  createdAt: 1,
};

function createPlayer(overrides: Partial<IAudioPlayerService> = {}): IAudioPlayerService {
  return {
    initialize: vi.fn(),
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
    getAllActiveTracks: vi.fn().mockReturnValue([]),
    cleanup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createLibrary(items: Record<string, AudioLibraryItem> = { [item.id]: item }): IAudioLibraryService {
  return {
    load: vi.fn(),
    get: vi.fn((id: string) => items[id]),
    getByType: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    getAll: vi.fn(),
    clear: vi.fn(),
    get size() {
      return Object.keys(items).length;
    },
  };
}

describe('AudioTriggerScheduler', () => {
  it('plays matching triggers with trigger and audio metadata', async () => {
    const player = createPlayer();
    const scheduler = new AudioTriggerScheduler(player, createLibrary());

    await scheduler.executeTriggersByType(
      [
        { id: 'trigger-1', audioId: 'sfx-door', triggerType: 'scene_start', volume: 0.7 },
        { id: 'trigger-2', audioId: 'sfx-door', triggerType: 'choice_shown' },
      ],
      'scene_start',
    );

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledWith('sfx_trigger-1', 'door.mp3', {
      volume: 0.7,
      loop: false,
      fadeIn: undefined,
      metadata: { audioId: 'sfx-door', triggerId: 'trigger-1' },
    });
  });

  it('stops active tracks of the same type before stopPrevious playback', async () => {
    const player = createPlayer({
      getAllActiveTracks: vi.fn().mockReturnValue([
        {
          trackId: 'sfx_old',
          isPlaying: true,
          volume: 1,
          loop: false,
          startTime: 1,
          metadata: { audioId: 'sfx-door' },
        },
      ]),
    });
    const scheduler = new AudioTriggerScheduler(player, createLibrary());

    await scheduler.executeTrigger({
      id: 'trigger-new',
      audioId: 'sfx-door',
      triggerType: 'manual',
      stopPrevious: true,
      fadeOut: 250,
    });

    expect(player.stop).toHaveBeenCalledWith('sfx_old', 250);
    expect(player.play).toHaveBeenCalledWith(
      'sfx_trigger-new',
      'door.mp3',
      expect.objectContaining({ metadata: { audioId: 'sfx-door', triggerId: 'trigger-new' } }),
    );
  });
});

