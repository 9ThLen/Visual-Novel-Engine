/**
 * Selectors over the persisted app state.
 *
 * They live apart from the store itself because there are two stores — the
 * studio's (`stores/use-app-store.ts`) and the player build's
 * (`stores/use-app-store.player.ts`) — and reading state is identical in both.
 * Each store re-exports these so callers keep importing from one place.
 */
import { resolveCanonicalStartSceneId } from '@/lib/scene-operations';
import { toReaderScene } from '@/lib/reader-scene';
import {
  getReaderSceneRecord,
  getSceneRecordFromAccess,
  getSceneRecordMapForStoryFromAccess,
  getSceneRecordsForStoryFromAccess,
  getStoryMetadataFromAccess,
  isReadingRelease,
} from '@/lib/scene-access';
import type { AppState } from '@/stores/app-store-types';

export const selectStoryMetadata = (storyId: string) => (state: AppState) =>
  getStoryMetadataFromAccess(state, storyId);

export const selectCanonicalSceneRecord = (storyId: string, sceneId: string) => (state: AppState) =>
  getSceneRecordFromAccess(state, storyId, sceneId);

export const selectReaderScene = (storyId: string, sceneId: string) => (state: AppState) => {
  const record = getReaderSceneRecord(state, storyId, sceneId);
  return record ? toReaderScene(record) : null;
};

export const selectReaderStartSceneId =
  (storyId: string, fallbackSceneId: string | null | undefined) => (state: AppState) => {
    // A release names its own opening scene. Resolving against the working copy
    // could start the reader on a scene the author added after publishing.
    if (isReadingRelease(state, storyId)) return state.readerRelease?.startSceneId ?? fallbackSceneId;
    return resolveCanonicalStartSceneId(state, storyId, fallbackSceneId) || fallbackSceneId;
  };

export const selectSceneRecordMapForStory = (storyId: string) => (state: AppState) =>
  getSceneRecordMapForStoryFromAccess(state, storyId);

export const selectSceneRecordsForStory = (storyId: string) => (state: AppState) =>
  getSceneRecordsForStoryFromAccess(state, storyId);
