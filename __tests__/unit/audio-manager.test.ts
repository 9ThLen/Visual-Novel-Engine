import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { enhancedAudioManager } from '../../lib/audio-manager-enhanced';

describe('AudioManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for non-existent track isPlaying check', () => {
    expect(enhancedAudioManager.isPlaying('nonexistent')).toBe(false);
  });

  it('handles stop for non-existent track gracefully', async () => {
    await expect(enhancedAudioManager.stop('nonexistent')).resolves.not.toThrow();
  });

  it('handles stopAll gracefully when no tracks', async () => {
    await expect(enhancedAudioManager.stopAll()).resolves.not.toThrow();
  });

  it('handles setVolume for non-existent track gracefully', async () => {
    await expect(enhancedAudioManager.setVolume('nonexistent', 0.5)).resolves.not.toThrow();
  });

  it('singleton instance is defined', () => {
    expect(enhancedAudioManager).toBeDefined();
  });
});
