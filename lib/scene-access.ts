import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';

export type SceneAccessSnapshot = {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
};

export type SceneAccess = {
  getStoryMetadata: (storyId: string) => StoryMetadata | undefined;
  getSceneRecord: (storyId: string, sceneId: string) => SceneRecord | undefined;
  getSceneRecordMapForStory: (storyId: string) => Record<string, SceneRecord>;
  getSceneRecordsForStory: (storyId: string) => SceneRecord[];
};

export function getStoryMetadataFromAccess(
  snapshot: Pick<SceneAccessSnapshot, 'storiesMetadata'>,
  storyId: string,
): StoryMetadata | undefined {
  return snapshot.storiesMetadata.find((story) => story.id === storyId);
}

export function getSceneRecordMapForStoryFromAccess(
  snapshot: Pick<SceneAccessSnapshot, 'sceneRecordsByStory'>,
  storyId: string,
): Record<string, SceneRecord> {
  return snapshot.sceneRecordsByStory[storyId] || {};
}

export function getSceneRecordFromAccess(
  snapshot: Pick<SceneAccessSnapshot, 'sceneRecordsByStory'>,
  storyId: string,
  sceneId: string,
): SceneRecord | undefined {
  return getSceneRecordMapForStoryFromAccess(snapshot, storyId)[sceneId];
}

export function getSceneRecordsForStoryFromAccess(
  snapshot: SceneAccessSnapshot,
  storyId: string,
): SceneRecord[] {
  const storyRecords = Object.values(getSceneRecordMapForStoryFromAccess(snapshot, storyId));
  const sceneOrder = getStoryMetadataFromAccess(snapshot, storyId)?.sceneOrder;

  if (!sceneOrder?.length) {
    return storyRecords.sort((a, b) => a.createdAt - b.createdAt);
  }

  const orderIndex = new Map(sceneOrder.map((sceneId, index) => [sceneId, index]));
  return storyRecords.sort((a, b) => {
    const aIndex = orderIndex.get(a.id);
    const bIndex = orderIndex.get(b.id);
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
    if (aIndex !== undefined) return -1;
    if (bIndex !== undefined) return 1;
    return a.createdAt - b.createdAt;
  });
}

export function createInMemorySceneAccess(snapshot: SceneAccessSnapshot): SceneAccess {
  return {
    getStoryMetadata: (storyId) => getStoryMetadataFromAccess(snapshot, storyId),
    getSceneRecord: (storyId, sceneId) => getSceneRecordFromAccess(snapshot, storyId, sceneId),
    getSceneRecordMapForStory: (storyId) => getSceneRecordMapForStoryFromAccess(snapshot, storyId),
    getSceneRecordsForStory: (storyId) => getSceneRecordsForStoryFromAccess(snapshot, storyId),
  };
}
