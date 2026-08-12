import { migrateCharacterLibrary } from '@/lib/character-migration';
import {
  addImageAssetToStory,
  removeImageAssetFromStory,
} from '@/lib/story-image-library';
import type { AppActions } from '@/stores/app-store-types';
import type { AppStoreSet } from '@/stores/app-store-slices/types';
import {
  addMediaAssetToStory,
  removeMediaAssetFromStory,
} from '@/lib/story-media-library';

export type LibrariesSliceActions = Pick<
  AppActions,
  'setAudioLibrary' | 'setCharacterLibrary' | 'setMediaLibrary'
  | 'addImageAssetToStory' | 'removeImageAssetFromStory'
  | 'addMediaAssetToStory' | 'removeMediaAssetFromStory'
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
      set((state) => {
        const matchedAssetIds = items.flatMap((item) => {
          const asset = state.mediaLibrary.find((candidate) =>
            candidate.id === item.id || candidate.uri === item.uri);
          return asset ? [asset.id] : [];
        });
        return {
          audioLibraries: { ...state.audioLibraries, [storyId]: items },
          mediaAssetIdsByStory: matchedAssetIds.reduce(
            (current, assetId) => addMediaAssetToStory(current, storyId, assetId),
            state.mediaAssetIdsByStory,
          ),
        };
      }),

    setMediaLibrary: (assets) => set({ mediaLibrary: assets }),

    addImageAssetToStory: (storyId, assetId) =>
      set((state) => ({
        imageAssetIdsByStory: addImageAssetToStory(state.imageAssetIdsByStory, storyId, assetId),
        mediaAssetIdsByStory: addMediaAssetToStory(state.mediaAssetIdsByStory, storyId, assetId),
      })),

    removeImageAssetFromStory: (storyId, assetId) =>
      set((state) => ({
        imageAssetIdsByStory: removeImageAssetFromStory(state.imageAssetIdsByStory, storyId, assetId),
        mediaAssetIdsByStory: removeMediaAssetFromStory(state.mediaAssetIdsByStory, storyId, assetId),
      })),

    addMediaAssetToStory: (storyId, assetId) =>
      set((state) => ({
        mediaAssetIdsByStory: addMediaAssetToStory(state.mediaAssetIdsByStory, storyId, assetId),
      })),

    removeMediaAssetFromStory: (storyId, assetId) =>
      set((state) => ({
        mediaAssetIdsByStory: removeMediaAssetFromStory(state.mediaAssetIdsByStory, storyId, assetId),
      })),
  };
}
