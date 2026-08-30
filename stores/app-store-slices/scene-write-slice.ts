import type { SceneConnection, SceneRecord } from '@/lib/engine/types';
import {
  applyCanonicalSceneDelete,
  getCanonicalSceneRecordFromState,
  removeCanonicalConnection,
  replaceConnectionByOutputPort,
  syncCanonicalStartScene,
  updateSceneRecordPreservingMeta as applySceneRecordContentUpdates,
  type SceneRecordContentUpdates,
} from '@/lib/scene-operations';
import type { AppStateSet } from '@/stores/app-store-slices/types';
import type { AiChangeSetApplyResult } from '@/lib/ai/change-set';

/**
 * Every action that changes an author's scenes. Absent from the player store
 * (see `stores/use-app-store.player.ts`), which is the point of the split:
 * a published player cannot rewrite the story it is playing.
 */
export interface SceneWriteSlice {
  deleteScene: (storyId: string, sceneId: string) => void;
  saveSceneRecord: (record: SceneRecord) => void;
  commitAiChangeSet: (storyId: string, result: Extract<AiChangeSetApplyResult, { ok: true }>) => void;
  updateSceneRecordPreservingMeta: (
    storyId: string,
    sceneId: string,
    updates: SceneRecordContentUpdates
  ) => void;
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

/**
 * Writing a scene from a windowed hydration would persist the window as if it
 * were the whole story, dropping every scene outside it.
 */
function assertFullSceneHydration(
  sceneRecordHydration: Record<string, 'window' | 'full'>,
  storyId: string,
): void {
  if (sceneRecordHydration[storyId] !== 'full') {
    throw new Error(`Cannot mutate scenes for "${storyId}" before full hydration`);
  }
}

export function createSceneWriteSlice(set: AppStateSet): SceneWriteSlice {
  return {
    deleteScene: (storyId, sceneId) =>
      set((s) => {
        assertFullSceneHydration(s.sceneRecordHydration, storyId);
        return applyCanonicalSceneDelete(s, storyId, sceneId);
      }),

    saveSceneRecord: (record) =>
      set((s) => {
        assertFullSceneHydration(s.sceneRecordHydration, record.storyId);
        const storyRecords = { ...(s.sceneRecordsByStory[record.storyId] || {}) };
        storyRecords[record.id] = { ...record, updatedAt: Date.now() };

        return syncCanonicalStartScene(s, record.storyId, {
          sceneRecords: storyRecords,
          preferredStartSceneId: record.isStart ? record.id : undefined,
        });
      }),

    commitAiChangeSet: (storyId, result) =>
      set((s) => {
        assertFullSceneHydration(s.sceneRecordHydration, storyId);
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
        assertFullSceneHydration(s.sceneRecordHydration, storyId);
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

    updateSceneConnection: (storyId, fromSceneId, connection) =>
      set((s) => {
        assertFullSceneHydration(s.sceneRecordHydration, storyId);
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
      set((s) => {
        assertFullSceneHydration(s.sceneRecordHydration, storyId);
        return removeCanonicalConnection(s, storyId, fromSceneId, targetSceneId, outputPort);
      }),

    setStartScene: (storyId, sceneId) =>
      set((s) => {
        assertFullSceneHydration(s.sceneRecordHydration, storyId);
        return syncCanonicalStartScene(s, storyId, { preferredStartSceneId: sceneId });
      }),

    reorderScenes: (storyId, sceneIds) =>
      set((s) => {
        assertFullSceneHydration(s.sceneRecordHydration, storyId);
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
