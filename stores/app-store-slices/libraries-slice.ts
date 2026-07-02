import { migrateCharacterLibrary } from '@/lib/character-migration';
import type { AppActions } from '@/stores/app-store-types';
import type { AppStoreSet } from '@/stores/app-store-slices/types';

export type LibrariesSliceActions = Pick<
  AppActions,
  'setAudioLibrary' | 'setCharacterLibrary' | 'setMediaLibrary'
>;

export function createLibrariesSlice(set: AppStoreSet): LibrariesSliceActions {
  return {
    setCharacterLibrary: (storyId, characters) =>
      set((state) => ({
        characterLibraries: {
          ...state.characterLibraries,
          [storyId]: migrateCharacterLibrary(characters),
        },
      })),

    setAudioLibrary: (storyId, items) =>
      set((state) => ({
        audioLibraries: { ...state.audioLibraries, [storyId]: items },
      })),

    setMediaLibrary: (assets) => set({ mediaLibrary: assets }),
  };
}
