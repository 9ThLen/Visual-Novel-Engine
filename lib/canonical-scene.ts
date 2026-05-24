import { sceneRecordToStoryScene, storySceneToSceneRecordDraft } from '@/lib/scene-record-adapter';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryScene } from '@/lib/types';

export interface CanonicalSceneStateSnapshot {
  scenesByStory: Record<string, Record<string, StoryScene>>;
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
}

export type SceneRecordContentUpdates = Partial<
  Pick<SceneRecord, 'name' | 'description' | 'tags' | 'timeline' | 'sceneState'>
>;

export function updateSceneRecordPreservingMeta(
  existingRecord: SceneRecord,
  updates: SceneRecordContentUpdates
): SceneRecord {
  return {
    ...existingRecord,
    ...updates,
    updatedAt: Date.now(),
  };
}

export function getCanonicalSceneRecordFromState(
  state: CanonicalSceneStateSnapshot,
  storyId: string,
  sceneId: string
): SceneRecord | undefined {
  return state.sceneRecordsByStory[storyId]?.[sceneId];
}

export function getCanonicalSceneRecordsForStoryFromState(
  state: CanonicalSceneStateSnapshot,
  storyId: string
): SceneRecord[] {
  const storyRecords = Object.values(state.sceneRecordsByStory[storyId] || {});
  return storyRecords.sort((a, b) => a.createdAt - b.createdAt);
}

export function buildCompatibilitySceneMapFromState(
  state: CanonicalSceneStateSnapshot,
  storyId: string
): Record<string, StoryScene> {
  const canonicalRecords = getCanonicalSceneRecordsForStoryFromState(state, storyId);
  if (canonicalRecords.length > 0) {
    return canonicalRecords.reduce<Record<string, StoryScene>>((acc, sceneRecord) => {
      acc[sceneRecord.id] = sceneRecordToStoryScene(sceneRecord);
      return acc;
    }, {});
  }

  return state.scenesByStory[storyId] || {};
}
