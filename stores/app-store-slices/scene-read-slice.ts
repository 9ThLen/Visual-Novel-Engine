import type { SceneRecord } from '@/lib/engine/types';
import { createPersistentStorage } from '@/lib/persistent-storage';
import { buildReaderSceneCache, getScenePrefetchSceneIds } from '@/lib/reader-scene-cache';
import { createInMemorySceneAccess } from '@/lib/scene-access';
import {
  loadReaderSceneRecordWindow,
  loadSceneRecordForStory,
  loadSceneRecordsForStory,
} from '@/lib/scene-record-storage';
import { getCanonicalSceneRecordsForStoryFromState } from '@/lib/scene-operations';
import type { AppStateGet, AppStateSet } from '@/stores/app-store-slices/types';

/**
 * The half of the scene slice a reader needs: bringing scenes into memory and
 * reading them back. Nothing here writes a scene.
 *
 * Split out from the authoring half so a player build can compose a store that
 * is physically unable to modify the author's work — see
 * `stores/use-app-store.player.ts`. `stores/app-store-slices/scene-slice.ts`
 * still composes both halves for the studio, so nothing outside the player
 * profile has to care that the split exists.
 */
export interface SceneReadSlice {
  hydrateSceneRecordsForStory: (storyId: string) => Promise<void>;
  hydrateReaderSceneWindow: (
    storyId: string,
    sceneId: string,
    maxPrefetchScenes?: number
  ) => Promise<boolean>;
  getScenesForStory: (storyId: string) => SceneRecord[];
}

export function createSceneReadSlice(
  set: AppStateSet,
  get: AppStateGet,
  storage = createPersistentStorage(),
): SceneReadSlice {
  return {
    hydrateSceneRecordsForStory: async (storyId) => {
      if (get().sceneRecordHydration[storyId] === 'full') {
        return;
      }

      const records = await loadSceneRecordsForStory(storage, storyId);
      const currentRecords = get().sceneRecordsByStory[storyId] || {};
      if (Object.keys(records).length === 0) {
        if (Object.keys(currentRecords).length === 0) return;
        set((s) => ({
          sceneRecordHydration: {
            ...s.sceneRecordHydration,
            [storyId]: 'full',
          },
        }));
        return;
      }

      set((s) => ({
        sceneRecordsByStory: {
          ...s.sceneRecordsByStory,
          [storyId]: {
            ...records,
            ...(s.sceneRecordsByStory[storyId] || {}),
          },
        },
        sceneRecordHydration: {
          ...s.sceneRecordHydration,
          [storyId]: 'full',
        },
      }));
    },

    hydrateReaderSceneWindow: async (storyId, sceneId, maxPrefetchScenes = 4) => {
      // A release is loaded whole and never windowed: prefetching from the
      // author's stored scenes would pull the working copy back in under the
      // frozen one.
      const release = get().readerRelease;
      if (release && release.storyId === storyId) return !!release.scenes[sceneId];

      if (get().sceneRecordHydration[storyId] === 'full') {
        return !!get().sceneRecordsByStory[storyId]?.[sceneId];
      }

      const currentRecords = get().sceneRecordsByStory[storyId] || {};
      let storedRecords: Record<string, SceneRecord> = {};
      if (currentRecords[sceneId]) {
        const prefetchSceneIds = getScenePrefetchSceneIds(currentRecords[sceneId]).slice(
          0,
          maxPrefetchScenes,
        );
        const prefetchedScenes = await Promise.all(
          prefetchSceneIds.map((id) => loadSceneRecordForStory(storage, storyId, id)),
        );
        storedRecords = Object.fromEntries(
          prefetchedScenes
            .filter((record): record is SceneRecord => !!record)
            .map((record) => [record.id, record]),
        );
      } else {
        storedRecords = await loadReaderSceneRecordWindow(
          storage,
          storyId,
          sceneId,
          maxPrefetchScenes,
        );
      }
      const sourceRecords = {
        ...storedRecords,
        ...currentRecords,
      };
      if (!sourceRecords[sceneId]) {
        return false;
      }

      const sceneAccess = createInMemorySceneAccess({
        storiesMetadata: get().storiesMetadata,
        sceneRecordsByStory: {
          [storyId]: sourceRecords,
        },
      });
      const cache = buildReaderSceneCache(sceneAccess, storyId, sceneId, { maxPrefetchScenes });

      set((s) => ({
        sceneRecordsByStory: {
          ...s.sceneRecordsByStory,
          [storyId]: cache.sceneRecords,
        },
        sceneRecordHydration: {
          ...s.sceneRecordHydration,
          [storyId]: 'window',
        },
      }));
      return cache.hasSceneRecord(sceneId);
    },

    getScenesForStory: (storyId) => {
      return getCanonicalSceneRecordsForStoryFromState(get(), storyId);
    },
  };
}
