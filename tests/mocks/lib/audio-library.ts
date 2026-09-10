/**
 * Mock for lib/audio-library.ts
 * Pure function mocks for testing.
 */

export const getAudioLibraryPure = vi.fn().mockReturnValue([]);
export const getPlaybackAudioLibraryPure = vi.fn().mockReturnValue([]);
export const buildPlaybackAudioLibraryItems = vi.fn().mockReturnValue([]);
export const saveAudioLibraryPure = vi.fn().mockReturnValue({});
export const addAudioToLibraryPure = vi.fn().mockReturnValue({} as any);
export const updateAudioInLibraryPure = vi.fn().mockReturnValue([]);
export const deleteAudioFromLibraryPure = vi.fn().mockReturnValue([]);
export const searchAudioLibraryPure = vi.fn().mockReturnValue([]);
export const getAudioByTypePure = vi.fn().mockReturnValue([]);
export const importAudioLibraryPure = vi.fn().mockReturnValue([]);
export const exportAudioLibraryPure = vi.fn().mockReturnValue('');

// Backward compatibility wrappers (store-aware)
export const getPlaybackAudioLibrary = vi.fn().mockResolvedValue([]);
export const importAudioLibrary = vi.fn().mockResolvedValue(undefined);
export const saveAudioLibrary = vi.fn().mockResolvedValue(undefined);
