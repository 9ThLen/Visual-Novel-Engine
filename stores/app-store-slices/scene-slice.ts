import type { SceneConnection, SceneRecord } from '@/lib/engine/types';
import { createPersistentStorage } from '@/lib/persistent-storage';
import { buildReaderSceneCache, getScenePrefetchSceneIds } from '@/lib/reader-scene-cache';
import { createInMemorySceneAccess } from '@/lib/scene-access';
import {
  loadReaderSceneRecordWindow,
  loadSceneRecordForStory,
  loadSceneRecordsForStory,
} from '@/lib/scene-record-storage';
import {
  applyCanonicalSceneDelete,
  getCanonicalSceneRecordFromState,
  getCanonicalSceneRecordsForStoryFromState,
  removeCanonicalConnection,
  replaceConnectionByOutputPort,
  syncCanonicalStartScene,
  updateSceneRecordPreservingMeta as applySceneRecordContentUpdates,
  type SceneRecordContentUpdates,
} from '@/lib/scene-operations';
import type { AppStoreGet, AppStoreSet } from '@/stores/app-store-slices/types';
import type { AiChangeSetApplyResult } from '@/lib/ai/change-set';

export interface SceneSlice {
  hydrateSceneRecordsForStory: (storyId: string) => Promise<void>;
  hydrateReaderSceneWindow: (
    storyId: string,
    sceneId: string,
    maxPrefetchScenes?: number
  ) => Promise<boolean>;
  deleteScene: (storyId: string, sceneId: string) => void;
  saveSceneRecord: (record: SceneRecord) => void;
  commitAiChangeSet: (storyId: string, result: Extract<AiChangeSetApplyResult, { ok: true }>) => void;
  updateSceneRecordPreservingMeta: (
    storyId: string,
    sceneId: string,
    updates: SceneRecordContentUpdates
  ) => void;
  getScenesForStory: (storyId: string) => SceneRecord[];
  updateSceneConnection: (storyId: string, fromSceneId: string, connection: SceneConnection) => void;
  removeSceneConnection: (
    storyId: string,
    fromSceneId: string,
    targetSceneId: string,
    outputPort?: string
  ) => void;
  setStartScene: (storyId: string, sceneId: string) => void;
  reorderScenes: (storyId: string, sceneIds: string[]) => void;
}

export function createSceneSlice(
  set: AppStoreSet,
  get: AppStoreGet,
  storage = createPersistentStorage(),
): SceneSlice {
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

    deleteScene: (storyId, sceneId) =>
      set((s) => applyCanonicalSceneDelete(s, storyId, sceneId)),

    saveSceneRecord: (record) =>
      set((s) => {
        const storyRecords = { ...(s.sceneRecordsByStory[record.storyId] || {}) };
        storyRecords[record.id] = { ...record, updatedAt: Date.now() };

        return syncCanonicalStartScene(s, record.storyId, {
          sceneRecords: storyRecords,
          preferredStartSceneId: record.isStart ? record.id : undefined,
        });
      }),

    commitAiChangeSet: (storyId, result) =>
      set((s) => {
        const storyRecords = { ...(s.sceneRecordsByStory[storyId] || {}) };
        for (const record of result.scenesToSave) {
          storyRecords[record.id] = { ...record, updatedAt: Date.now() };
        }
        const withOrder = {
          ...s,
          characterLibraries: result.charactersToSave
            ? { ...s.characterLibraries, [storyId]: result.charactersToSave }
            : s.characterLibraries,
          storiesMetadata: s.storiesMetadata.map((metadata) =>
            metadata.id === storyId
              ? { ...metadata, sceneOrder: result.nextSceneOrder, updatedAt: Date.now() }
              : metadata,
          ),
        };
        const preferredStartSceneId = result.scenesToSave.find((record) => record.isStart)?.id;
        return syncCanonicalStartScene(withOrder, storyId, {
          sceneRecords: storyRecords,
          preferredStartSceneId,
        });
      }),

    updateSceneRecordPreservingMeta: (storyId, sceneId, updates) =>
      set((s) => {
        const existingRecord = getCanonicalSceneRecordFromState(s, storyId, sceneId);
        if (!existingRecord) {
          return {};
        }

        const storyRecords = { ...(s.sceneRecordsByStory[storyId] || {}) };
        storyRecords[sceneId] = applySceneRecordContentUpdates(existingRecord, updates);

        return {
          sceneRecordsByStory: { ...s.sceneRecordsByStory, [storyId]: storyRecords },
          storiesMetadata: s.storiesMetadata.map((m) =>
            m.id === storyId ? { ...m, updatedAt: Date.now() } : m
          ),
        };
      }),

    getScenesForStory: (storyId) => {
      return getCanonicalSceneRecordsForStoryFromState(get(), storyId);
    },

    updateSceneConnection: (storyId, fromSceneId, connection) =>
      set((s) => {
        const storyRecords = { ...(s.sceneRecordsByStory[storyId] || {}) };
        const fromScene = storyRecords[fromSceneId];
        if (!fromScene) return {};
        storyRecords[fromSceneId] = {
          ...fromScene,
          connections: replaceConnectionByOutputPort(fromScene.connections || [], connection),
          updatedAt: Date.now(),
        };
        return { sceneRecordsByStory: { ...s.sceneRecordsByStory, [storyId]: storyRecords } };
      }),

    removeSceneConnection: (storyId, fromSceneId, targetSceneId, outputPort) =>
      set((s) => removeCanonicalConnection(s, storyId, fromSceneId, targetSceneId, outputPort)),

    setStartScene: (storyId, sceneId) =>
      set((s) => syncCanonicalStartScene(s, storyId, { preferredStartSceneId: sceneId })),

    reorderScenes: (storyId, sceneIds) =>
      set((s) => {
        const storyRecords = { ...(s.sceneRecordsByStory[storyId] || {}) };
        const orderedSceneIds = [
          ...sceneIds.filter((id) => storyRecords[id]),
          ...Object.keys(storyRecords).filter((id) => !sceneIds.includes(id)),
        ];
        return {
          storiesMetadata: s.storiesMetadata.map((metadata) =>
            metadata.id === storyId
              ? { ...metadata, sceneOrder: orderedSceneIds, updatedAt: Date.now() }
              : metadata
          ),
        };
      }),
  };
}
