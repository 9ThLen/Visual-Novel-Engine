import type { SceneRecord } from '@/lib/engine/types';
import { createPersistentStorage } from '@/lib/persistent-storage';
import type { SceneRecordStorageLike } from '@/lib/scene-record-storage';
import {
  createSnapshot,
  readSnapshot,
  type SnapshotMeta,
  type SnapshotStoryMetadata,
} from '@/lib/story-snapshots';
import { allTranslations } from '@/lib/translations';
import type { AppStoreGet, AppStoreSet } from '@/stores/app-store-slices/types';
import { notifySnapshotEvicted } from '@/stores/snapshot-eviction-registry';

/** i18n key for the automatic snapshot taken right before a restore. */
const BEFORE_RESTORE_KEY = 'storySnapshots.beforeRestore';

export interface SnapshotsSlice {
  createStorySnapshot: (
    storyId: string,
    name: string,
    automatic?: boolean,
  ) => Promise<SnapshotMeta | null>;
  restoreStorySnapshot: (storyId: string, snapshotId: string) => Promise<boolean>;
}

function resolveBeforeRestoreName(get: AppStoreGet): string {
  const language = get().language;
  return (
    allTranslations[language]?.[BEFORE_RESTORE_KEY] ??
    allTranslations.en[BEFORE_RESTORE_KEY] ??
    'Before restore'
  );
}

function toStoryMetadataSubset(get: AppStoreGet, storyId: string): SnapshotStoryMetadata | null {
  const story = get().storiesMetadata.find((item) => item.id === storyId);
  if (!story) return null;
  return {
    title: story.title,
    startSceneId: story.startSceneId,
    sceneOrder: story.sceneOrder,
    tags: story.tags,
  };
}

export function createSnapshotsSlice(
  set: AppStoreSet,
  get: AppStoreGet,
  storage: SceneRecordStorageLike = createPersistentStorage(),
): SnapshotsSlice {
  return {
    createStorySnapshot: async (storyId, name, automatic = false) => {
      // Snapshots must capture the whole story, not just a hydrated window.
      await get().hydrateSceneRecordsForStory(storyId);
      const scenes = get().getScenesForStory(storyId);
      return createSnapshot(storage, storyId, name, scenes, {
        automatic,
        story: toStoryMetadataSubset(get, storyId),
        onEvict: (snapshotId) => notifySnapshotEvicted(storyId, snapshotId),
      });
    },

    restoreStorySnapshot: async (storyId, snapshotId) => {
      // Build the full scene set up front; a failed read throws here and leaves
      // the live story untouched. This must happen before the automatic snapshot:
      // at the cap that snapshot may evict the target being restored.
      const restored = await readSnapshot(storage, storyId, snapshotId);
      const { scenes } = restored;
      const records: Record<string, SceneRecord> = Object.fromEntries(
        scenes.map((record) => [record.id, record]),
      );
      const restoredOrder = [
        ...(restored.story?.sceneOrder ?? []).filter((id) => records[id]),
        ...Object.keys(records).filter((id) => !(restored.story?.sceneOrder ?? []).includes(id)),
      ];
      const restoredStart = restored.story?.startSceneId && records[restored.story.startSceneId]
        ? restored.story.startSceneId
        : restoredOrder[0] ?? Object.keys(records)[0] ?? '';
      const restoredRecords = restored.story
        ? Object.fromEntries(Object.entries(records).map(([id, record]) => [
            id,
            { ...record, isStart: id === restoredStart },
          ]))
        : records;

      // Make the restore itself undoable only after the target is safely in memory.
      await get().createStorySnapshot(storyId, resolveBeforeRestoreName(get), true);

      // Replace in memory; the persist middleware writes these through the
      // existing canonical scene-save path (no second write path).
      set((state) => ({
        sceneRecordsByStory: { ...state.sceneRecordsByStory, [storyId]: restoredRecords },
        sceneRecordHydration: { ...state.sceneRecordHydration, [storyId]: 'full' },
        storiesMetadata: state.storiesMetadata.map((metadata) => {
          if (metadata.id !== storyId) return metadata;
          const story = restored.story;
          if (!story) return { ...metadata, sceneCount: scenes.length, updatedAt: Date.now() };
          return {
            ...metadata,
            ...(story.title === undefined ? {} : { title: story.title }),
            ...(story.tags === undefined ? {} : { tags: story.tags }),
            sceneOrder: restoredOrder,
            startSceneId: restoredStart,
            sceneCount: scenes.length,
            updatedAt: Date.now(),
          };
        }),
      }));

      return true;
    },
  };
}
