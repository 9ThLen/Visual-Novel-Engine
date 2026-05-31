import { AudioPlayerService } from '@/lib/audio-player-service';

import {
  setAudioModeAsync,
  createAudioPlayer,
} from 'expo-audio';
import {
  resolvePlayableAssetUri,
} from '@/lib/asset-resolver';

const mockSetAudioModeAsync = vi.mocked(setAudioModeAsync);
const mockCreateAudioPlayer = vi.mocked(createAudioPlayer);
const mockResolvePlayableAssetUri = vi.mocked(resolvePlayableAssetUri);

function createMockPlayer() {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
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
    mockCreateAudioPlayer.mockReturnValue(createMockPlayer() as any);
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
  });

  it('does not create a player when the source cannot be resolved', async () => {
    mockResolvePlayableAssetUri.mockResolvedValue(null);
    const service = new AudioPlayerService();

    await service.play('sfx', 'missing-audio-id');

    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  });

  it('crossFade restarts bgm after stopping the previous track', async () => {
    const firstPlayer = createMockPlayer();
    firstPlayer.playing = true;
    const secondPlayer = createMockPlayer();
    const createPlayerMock = mockCreateAudioPlayer
      .mockReturnValueOnce(firstPlayer as any)
      .mockReturnValueOnce(secondPlayer as any);

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
  });
});
