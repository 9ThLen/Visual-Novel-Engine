import { generateId } from '@/lib/id-utils';
import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  createCanonicalStorySeed,
} from '@/lib/scene-operations';
import { type SceneRecordStorageLike } from '@/lib/scene-record-storage';
import { forgetStoryStorage } from '@/lib/story-storage';
import type { StoryMetadata } from '@/lib/story-domain';
import type { AppStoreSet } from '@/stores/app-store-slices/types';

export interface StorySlice {
  createStory: (title: string) => { storyId: string; sceneId: string };
  deleteStory: (storyId: string) => void;
  updateStoryMetadata: (storyId: string, updates: Partial<StoryMetadata>) => void;
}

export function createStorySlice(
  set: AppStoreSet,
  storage: SceneRecordStorageLike = createPersistentStorage() as SceneRecordStorageLike,
): StorySlice {
  return {
    createStory: (title) => {
      const storyId = generateId('story');
      const sceneId = 'scene_1';
      const seed = createCanonicalStorySeed(title, { storyId, sceneId });
      set((s) => ({
        storiesMetadata: [...s.storiesMetadata.filter((m) => m.id !== storyId), seed.metadata],
        sceneRecordsByStory: {
          ...s.sceneRecordsByStory,
          [storyId]: {
            [sceneId]: seed.sceneRecord,
          },
        },
        sceneRecordHydration: {
          ...s.sceneRecordHydration,
          [storyId]: 'full',
        },
      }));
      return { storyId, sceneId };
    },

    deleteStory: (storyId) => {
      // Storage no longer infers a deletion from a story missing in a write, so
      // this is what actually removes the scenes and every snapshot of them.
      // Fire-and-forget: the state change must not wait on IndexedDB, and a
      // failure here leaves orphaned keys, which is the harmless direction.
      void forgetStoryStorage(storage, storyId).catch(() => {});
      set((s) => {
        const { [storyId]: __, ...recordRest } = s.sceneRecordsByStory;
        const { [storyId]: ___, ...hydrationRest } = s.sceneRecordHydration;
        const { [storyId]: ____, ...imageAssetIdsRest } = s.imageAssetIdsByStory;
        const { [storyId]: _____, ...mediaAssetIdsRest } = s.mediaAssetIdsByStory;
        return {
          storiesMetadata: s.storiesMetadata.filter((m) => m.id !== storyId),
          sceneRecordsByStory: recordRest,
          sceneRecordHydration: hydrationRest,
          imageAssetIdsByStory: imageAssetIdsRest,
          mediaAssetIdsByStory: mediaAssetIdsRest,
        };
      });
    },

    updateStoryMetadata: (storyId, updates) =>
      set((s) => ({
        storiesMetadata: s.storiesMetadata.map((m) =>
          m.id === storyId ? { ...m, ...updates, updatedAt: Date.now() } : m
        ),
      })),
  };
}
