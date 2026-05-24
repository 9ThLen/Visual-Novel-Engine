import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPlay,
  mockPause,
  mockRemove,
  mockSetAudioModeAsync,
  mockCreateAudioPlayer,
  mockResolvePlayableAssetUri,
} = vi.hoisted(() => ({
  mockPlay: vi.fn(),
  mockPause: vi.fn(),
  mockRemove: vi.fn(),
  mockSetAudioModeAsync: vi.fn().mockResolvedValue(undefined),
  mockCreateAudioPlayer: vi.fn(),
  mockResolvePlayableAssetUri: vi.fn(),
}));

vi.mock('expo-audio', () => ({
  setAudioModeAsync: mockSetAudioModeAsync,
  createAudioPlayer: mockCreateAudioPlayer,
}));

vi.mock('@/lib/asset-resolver', () => ({
  resolvePlayableAssetUri: mockResolvePlayableAssetUri,
}));

import { AudioPlayerService } from '@/lib/audio-player-service';

function createMockPlayer() {
  return {
    play: mockPlay,
    pause: mockPause,
    remove: mockRemove,
    playing: false,
    volume: 1,
    loop: false,
  };
}

describe('audio-player-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockResolvePlayableAssetUri.mockResolvedValue('file:///resolved/audio.mp3');
    mockCreateAudioPlayer.mockReturnValue(createMockPlayer());
  });

  it('resolves playable asset uri before creating the audio player', async () => {
    const service = new AudioPlayerService();

    await service.play('bgm', 'assets/sounds-sample/music-peaceful.mp3', {
      volume: 0.5,
      loop: true,
    });

    expect(mockResolvePlayableAssetUri).toHaveBeenCalledWith('assets/sounds-sample/music-peaceful.mp3');
    expect(mockCreateAudioPlayer).toHaveBeenCalledWith('file:///resolved/audio.mp3', {
      downloadFirst: true,
      keepAudioSessionActive: true,
    });
    expect(mockPlay).toHaveBeenCalled();
  });

  it('does not create a player when the source cannot be resolved', async () => {
    mockResolvePlayableAssetUri.mockResolvedValue(null);
    const service = new AudioPlayerService();

    await service.play('sfx', 'missing-audio-id');

    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('crossFade restarts bgm after stopping the previous track', async () => {
    const firstPlayer = createMockPlayer();
    firstPlayer.playing = true;
    const secondPlayer = createMockPlayer();
    const createPlayerMock = mockCreateAudioPlayer
      .mockReturnValueOnce(firstPlayer)
      .mockReturnValueOnce(secondPlayer);

    const service = new AudioPlayerService();

    await service.play('bgm', 'assets/sounds-sample/music-peaceful.mp3');
    await service.crossFade('bgm', 'assets/sounds-sample/music-eerie.mp3', {
      volume: 0.7,
      loop: true,
    });

    expect(createPlayerMock).toHaveBeenNthCalledWith(1, 'file:///resolved/audio.mp3', {
      downloadFirst: true,
      keepAudioSessionActive: true,
    });
    expect(createPlayerMock).toHaveBeenNthCalledWith(2, 'file:///resolved/audio.mp3', {
      downloadFirst: true,
      keepAudioSessionActive: true,
    });
    expect(mockPause).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalled();
    expect(mockPlay).toHaveBeenCalledTimes(2);
  });
});
