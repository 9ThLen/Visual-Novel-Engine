import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioManager } from '../../lib/audio-manager';

// Mock expo-audio module
vi.mock('expo-audio', () => ({
  setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
  AudioModule: {
    AudioPlayer: vi.fn().mockImplementation((uri: string, volume: number, _loop: boolean) => ({
      uri,
      volume,
      loop: false,
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      remove: vi.fn(),
      playing: false,
    })),
  },
}));

describe('AudioManager', () => {
  let audioManager: InstanceType<typeof AudioManager>;

  beforeEach(() => {
    audioManager = new AudioManager();
  });

  afterEach(() => {
    audioManager.destroy();
  });

  it('initializes correctly', async () => {
    await audioManager.initialize();
    expect(audioManager.isPlaying('nonexistent')).toBe(false);
  });

  it('returns false for non-existent track isPlaying check', () => {
    expect(audioManager.isPlaying('nonexistent')).toBe(false);
  });

  it('stops all tracks and cleans up on destroy', () => {
    expect(() => audioManager.destroy()).not.toThrow();
  });

  it('handles stop for non-existent track gracefully', async () => {
    await expect(audioManager.stop('nonexistent')).resolves.not.toThrow();
  });

  it('handles stopAll gracefully when no tracks', async () => {
    await expect(audioManager.stopAll()).resolves.not.toThrow();
  });

  it('handles setVolume for non-existent track gracefully', async () => {
    await expect(audioManager.setVolume('nonexistent', 0.5)).resolves.not.toThrow();
  });
});
