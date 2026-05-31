const createMockManager = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  setVolume: vi.fn().mockResolvedValue(undefined),
  play: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  stopAll: vi.fn().mockResolvedValue(undefined),
  crossFade: vi.fn().mockResolvedValue(undefined),
  cancelAllTriggers: vi.fn(),
  getPlaybackState: vi.fn().mockReturnValue([]),
  loadLibrary: vi.fn(),
  executeTriggersByType: vi.fn().mockResolvedValue(undefined),
  processTriggers: vi.fn().mockResolvedValue(undefined),
  cleanup: vi.fn(),
});

export const enhancedAudioManager = createMockManager();
export const audioManager = createMockManager();
