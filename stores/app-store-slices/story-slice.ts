import { generateId } from '@/lib/id-utils';
import {
  createCanonicalStorySeed,
} from '@/lib/scene-operations';
import type { StoryMetadata } from '@/lib/story-domain';
import type { AppStoreSet } from '@/stores/app-store-slices/types';

export interface StorySlice {
  createStory: (title: string) => { storyId: string; sceneId: string };
  deleteStory: (storyId: string) => void;
  updateStoryMetadata: (storyId: string, updates: Partial<StoryMetadata>) => void;
}

export function createStorySlice(set: AppStoreSet): StorySlice {
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

    deleteStory: (storyId) =>
      set((s) => {
        const { [storyId]: __, ...recordRest } = s.sceneRecordsByStory;
        const { [storyId]: ___, ...hydrationRest } = s.sceneRecordHydration;
        const { [storyId]: ____, ...imageAssetIdsRest } = s.imageAssetIdsByStory;
        return {
          storiesMetadata: s.storiesMetadata.filter((m) => m.id !== storyId),
          sceneRecordsByStory: recordRest,
          sceneRecordHydration: hydrationRest,
          imageAssetIdsByStory: imageAssetIdsRest,
        };
      }),

    updateStoryMetadata: (storyId, updates) =>
      set((s) => ({
        storiesMetadata: s.storiesMetadata.map((m) =>
          m.id === storyId ? { ...m, ...updates, updatedAt: Date.now() } : m
        ),
      })),
  };
}
