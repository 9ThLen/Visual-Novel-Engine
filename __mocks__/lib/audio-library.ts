import * as real from '../../lib/audio-library';

export const getPlaybackAudioLibrary = vi.fn().mockImplementation(real.getPlaybackAudioLibrary ?? (() => Promise.resolve([])));
export const buildPlaybackAudioLibraryItems = vi.fn().mockImplementation(real.buildPlaybackAudioLibraryItems ?? (() => []));
export const importAudioLibrary = vi.fn().mockImplementation(real.importAudioLibrary ?? (() => Promise.resolve()));
export const saveAudioLibrary = vi.fn().mockImplementation(real.saveAudioLibrary ?? (() => Promise.resolve()));
