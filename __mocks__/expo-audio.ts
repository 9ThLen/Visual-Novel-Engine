export const mockSetAudioModeAsync = vi.fn().mockResolvedValue(undefined);
export const mockCreateAudioPlayer = vi.fn();

export const setAudioModeAsync = mockSetAudioModeAsync;
export const createAudioPlayer = mockCreateAudioPlayer;
