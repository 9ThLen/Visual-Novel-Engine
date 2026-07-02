import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import type { ReaderRuntimeSnapshot } from '@/lib/reader-runtime';
import { toReaderScene } from '@/lib/reader-scene';
import { createInMemorySceneAccess } from '@/lib/scene-access';
import {
  buildReaderRuntimeSnapshotFromCache,
  buildReaderSceneCache,
} from '@/lib/reader-scene-cache';

type SceneSnapshotState = {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
};

export function buildScopedReaderRuntimeSnapshot(
  state: SceneSnapshotState,
  storyId: string,
  sceneId: string,
): ReaderRuntimeSnapshot {
  const sceneAccess = createInMemorySceneAccess(state);
  const metadata = sceneAccess.getStoryMetadata(storyId);
  const sceneRecord = sceneAccess.getSceneRecord(storyId, sceneId);

  return {
    storiesMetadata: metadata ? [metadata] : [],
    sceneRecordsByStory: sceneRecord
      ? { [storyId]: { [sceneId]: toReaderScene(sceneRecord) } }
      : {},
  };
}

export function buildPrefetchedReaderRuntimeSnapshot(
  state: SceneSnapshotState,
  storyId: string,
  sceneId: string,
  maxPrefetchScenes = 4,
): ReaderRuntimeSnapshot {
  const sceneAccess = createInMemorySceneAccess(state);
  const cache = buildReaderSceneCache(sceneAccess, storyId, sceneId, { maxPrefetchScenes });
  return buildReaderRuntimeSnapshotFromCache(sceneAccess, cache);
}
