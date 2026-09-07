import { migrateCharacterLibrary } from '@/lib/character-migration';
import {
  forgetMedia,
  organizationForStory,
  type StoryMediaOrganization,
} from '@/lib/media-organization';
import { mediaKeyForAsset } from '@/lib/story-media-gallery';
import { keepOrphanedSpriteImages } from '@/lib/orphaned-sprite-images';
import {
  addImageAssetToStory,
  removeImageAssetFromStory,
} from '@/lib/story-image-library';
import type { AppActions } from '@/stores/app-store-types';
import type { AppStateSet } from '@/stores/app-store-slices/types';
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

/**
 * A file leaving the story takes its folder and tags with it.
 *
 * Left behind, they would be invisible until the same asset id came back — and
 * then they would file a different picture into a folder nobody chose for it.
 */
function forgetOrganization(
  state: { mediaOrganizationByStory: Record<string, StoryMediaOrganization> },
  storyId: string,
  assetId: string,
) {
  const current = organizationForStory(state.mediaOrganizationByStory, storyId);
  const next = forgetMedia(current, [mediaKeyForAsset(assetId)]);
  if (next === current) return {};
  return {
    mediaOrganizationByStory: { ...state.mediaOrganizationByStory, [storyId]: next },
  };
}

export function createLibrariesSlice(set: AppStateSet): LibrariesSliceActions {
  return {
    setCharacterLibrary: (storyId, characters) =>
      set((state) => {
        const migrated = migrateCharacterLibrary(characters);
        // Every path that removes a sprite — deleting a character in the
        // editor, detaching one in the media library, an AI change — arrives
        // here as a whole new library. Comparing against the old one is what
        // notices that a picture just lost the only thing pointing at it.
        const kept = keepOrphanedSpriteImages({
          storyId,
          previous: state.characterLibraries[storyId] ?? [],
          next: migrated,
          mediaLibrary: state.mediaLibrary,
          imageAssetIdsByStory: state.imageAssetIdsByStory,
          now: Date.now(),
        });

        return {
          characterLibraries: {
            ...state.characterLibraries,
            [storyId]: migrated,
          },
          ...(kept ?? {}),
        };
      }),

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
        ...forgetOrganization(state, storyId, assetId),
      })),

    addMediaAssetToStory: (storyId, assetId) =>
      set((state) => ({
        mediaAssetIdsByStory: addMediaAssetToStory(state.mediaAssetIdsByStory, storyId, assetId),
      })),

    removeMediaAssetFromStory: (storyId, assetId) =>
      set((state) => ({
        mediaAssetIdsByStory: removeMediaAssetFromStory(state.mediaAssetIdsByStory, storyId, assetId),
        ...forgetOrganization(state, storyId, assetId),
      })),
  };
}
