import { migrateCharacterLibrary } from '@/lib/character-migration';
import {
  addImageAssetToStory,
  removeImageAssetFromStory,
} from '@/lib/story-image-library';
import type { AppActions } from '@/stores/app-store-types';
import type { AppStoreSet } from '@/stores/app-store-slices/types';

export type LibrariesSliceActions = Pick<
  AppActions,
  'setAudioLibrary' | 'setCharacterLibrary' | 'setMediaLibrary'
  | 'addImageAssetToStory' | 'removeImageAssetFromStory'
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

    addImageAssetToStory: (storyId, assetId) =>
      set((state) => ({
        imageAssetIdsByStory: addImageAssetToStory(state.imageAssetIdsByStory, storyId, assetId),
      })),

    removeImageAssetFromStory: (storyId, assetId) =>
      set((state) => ({
        imageAssetIdsByStory: removeImageAssetFromStory(state.imageAssetIdsByStory, storyId, assetId),
      })),
  };
}
