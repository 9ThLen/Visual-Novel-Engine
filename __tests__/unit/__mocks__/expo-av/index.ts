// Mock for expo-av
const mockSound = {
  playAsync: vi.fn().mockResolvedValue(undefined),
  pauseAsync: vi.fn().mockResolvedValue(undefined),
  stopAsync: vi.fn().mockResolvedValue(undefined),
  setVolumeAsync: vi.fn().mockResolvedValue(undefined),
  setPositionAsync: vi.fn().mockResolvedValue(undefined),
  getStatusAsync: vi.fn().mockResolvedValue({ isLoaded: true, isPlaying: false }),
  unloadAsync: vi.fn().mockResolvedValue(undefined),
};

const mockAudio = {
  Sound: {
    createAsync: vi.fn().mockResolvedValue({ sound: mockSound }),
  },
};

export { mockSound, mockAudio };
export default mockAudio;