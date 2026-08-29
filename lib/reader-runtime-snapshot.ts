import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import type { ReaderRuntimeSnapshot } from '@/lib/reader-runtime';
import { toReaderScene } from '@/lib/reader-scene';
import { createReaderSceneAccess, type ReaderReleaseSource } from '@/lib/scene-access';
import {
  buildReaderRuntimeSnapshotFromCache,
  buildReaderSceneCache,
} from '@/lib/reader-scene-cache';

/**
 * Both snapshots below feed the reader — saving, loading and prefetching — so
 * they read through the reader's view. Building them from the working copy
 * would let a save taken during release playback carry the author's draft
 * text, and would fail outright on a scene that exists only in the release.
 */
type SceneSnapshotState = {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  readerRelease?: ReaderReleaseSource | null;
};

export function buildScopedReaderRuntimeSnapshot(
  state: SceneSnapshotState,
  storyId: string,
  sceneId: string,
): ReaderRuntimeSnapshot {
  const sceneAccess = createReaderSceneAccess(state);
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
  const sceneAccess = createReaderSceneAccess(state);
  const cache = buildReaderSceneCache(sceneAccess, storyId, sceneId, { maxPrefetchScenes });
  return buildReaderRuntimeSnapshotFromCache(sceneAccess, cache);
}
