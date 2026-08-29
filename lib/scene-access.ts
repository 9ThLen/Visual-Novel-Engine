import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';

/**
 * The frozen story a reader is currently playing.
 *
 * Present only while the reader is open on a release. It deliberately does not
 * override the shared accessors below: the editor reads through those too, and
 * a global switch that changed what every scene read returned would show an
 * author their own frozen copy the moment they left the reader. Only the
 * reader-facing accessors consult it.
 */
export type ReaderReleaseSource = {
  storyId: string;
  releaseId: string;
  version: string;
  startSceneId: string;
  scenes: Record<string, SceneRecord>;
};

export type SceneAccessSnapshot = {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  readerRelease?: ReaderReleaseSource | null;
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

/**
 * What the reader plays: the frozen release when one is open, the working copy
 * otherwise. Every reader read goes through here, and nothing else does.
 */
export function getReaderSceneRecordMap(
  snapshot: Pick<SceneAccessSnapshot, 'sceneRecordsByStory' | 'readerRelease'>,
  storyId: string,
): Record<string, SceneRecord> {
  const release = snapshot.readerRelease;
  if (release && release.storyId === storyId) return release.scenes;
  return getSceneRecordMapForStoryFromAccess(snapshot, storyId);
}

export function getReaderSceneRecord(
  snapshot: Pick<SceneAccessSnapshot, 'sceneRecordsByStory' | 'readerRelease'>,
  storyId: string,
  sceneId: string,
): SceneRecord | undefined {
  return getReaderSceneRecordMap(snapshot, storyId)[sceneId];
}

/** True when this story is being read from a release rather than a draft. */
export function isReadingRelease(
  snapshot: Pick<SceneAccessSnapshot, 'readerRelease'>,
  storyId: string,
): boolean {
  return snapshot.readerRelease?.storyId === storyId;
}

export function createInMemorySceneAccess(snapshot: SceneAccessSnapshot): SceneAccess {
  return {
    getStoryMetadata: (storyId) => getStoryMetadataFromAccess(snapshot, storyId),
    getSceneRecord: (storyId, sceneId) => getSceneRecordFromAccess(snapshot, storyId, sceneId),
    getSceneRecordMapForStory: (storyId) => getSceneRecordMapForStoryFromAccess(snapshot, storyId),
    getSceneRecordsForStory: (storyId) => getSceneRecordsForStoryFromAccess(snapshot, storyId),
  };
}

/** The reader's own view: identical, except scenes come from the release. */
export function createReaderSceneAccess(snapshot: SceneAccessSnapshot): SceneAccess {
  return {
    getStoryMetadata: (storyId) => getStoryMetadataFromAccess(snapshot, storyId),
    getSceneRecord: (storyId, sceneId) => getReaderSceneRecord(snapshot, storyId, sceneId),
    getSceneRecordMapForStory: (storyId) => getReaderSceneRecordMap(snapshot, storyId),
    getSceneRecordsForStory: (storyId) => (
      isReadingRelease(snapshot, storyId)
        ? Object.values(getReaderSceneRecordMap(snapshot, storyId))
        : getSceneRecordsForStoryFromAccess(snapshot, storyId)
    ),
  };
}
