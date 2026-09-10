import type {
  ChoiceBlockData,
  SceneRecord,
  TimelineStep,
  TransitionBlockData,
} from '@/lib/engine/types';
import type { ReaderRuntimeSnapshot } from '@/lib/reader-runtime';
import { toReaderScene } from '@/lib/reader-scene';
import type { SceneAccess } from '@/lib/scene-access';

export type ReaderSceneCache = {
  storyId: string;
  currentSceneId: string;
  cachedSceneIds: string[];
  sceneRecords: Record<string, SceneRecord>;
  getSceneRecord: (sceneId: string) => SceneRecord | undefined;
  hasSceneRecord: (sceneId: string) => boolean;
};

type ReaderSceneCacheOptions = {
  maxPrefetchScenes?: number;
};

function pushUniqueSceneId(sceneIds: string[], sceneId: string | null | undefined): void {
  if (!sceneId || sceneIds.includes(sceneId)) return;
  sceneIds.push(sceneId);
}

export function getTimelinePrefetchSceneIds(timeline: TimelineStep[]): string[] {
  const sceneIds: string[] = [];

  for (const step of timeline) {
    if (step.enabled === false) continue;

    if (step.blockType === 'transition') {
      pushUniqueSceneId(sceneIds, (step.data as TransitionBlockData).targetSceneId);
      continue;
    }

    if (step.blockType === 'choice') {
      for (const option of (step.data as ChoiceBlockData).options || []) {
        pushUniqueSceneId(sceneIds, option.targetSceneId);
      }
    }
  }

  return sceneIds;
}

export function getScenePrefetchSceneIds(sceneRecord: SceneRecord): string[] {
  const sceneIds: string[] = [];

  for (const connection of sceneRecord.connections || []) {
    pushUniqueSceneId(sceneIds, connection.targetSceneId);
  }
  for (const sceneId of getTimelinePrefetchSceneIds(sceneRecord.timeline || [])) {
    pushUniqueSceneId(sceneIds, sceneId);
  }

  return sceneIds;
}

export function buildReaderSceneCache(
  sceneAccess: SceneAccess,
  storyId: string,
  currentSceneId: string,
  options: ReaderSceneCacheOptions = {},
): ReaderSceneCache {
  const maxPrefetchScenes = options.maxPrefetchScenes ?? 4;
  const currentScene = sceneAccess.getSceneRecord(storyId, currentSceneId);
  const cachedSceneIds: string[] = [];
  const sceneRecords: Record<string, SceneRecord> = {};

  if (currentScene) {
    pushUniqueSceneId(cachedSceneIds, currentScene.id);
    sceneRecords[currentScene.id] = currentScene;

    for (const sceneId of getScenePrefetchSceneIds(currentScene).slice(0, maxPrefetchScenes)) {
      const sceneRecord = sceneAccess.getSceneRecord(storyId, sceneId);
      if (!sceneRecord) continue;
      pushUniqueSceneId(cachedSceneIds, sceneRecord.id);
      sceneRecords[sceneRecord.id] = sceneRecord;
    }
  }

  return {
    storyId,
    currentSceneId,
    cachedSceneIds,
    sceneRecords,
    getSceneRecord: (sceneId) => sceneRecords[sceneId],
    hasSceneRecord: (sceneId) => !!sceneRecords[sceneId],
  };
}

export function getReaderSceneRecordForNavigation(
  sceneAccess: SceneAccess,
  storyId: string,
  currentSceneId: string,
  targetSceneId: string,
  options: ReaderSceneCacheOptions = {},
): SceneRecord | undefined {
  const cache = buildReaderSceneCache(sceneAccess, storyId, currentSceneId, options);
  return cache.getSceneRecord(targetSceneId) ?? sceneAccess.getSceneRecord(storyId, targetSceneId);
}

export function buildReaderRuntimeSnapshotFromCache(
  sceneAccess: SceneAccess,
  cache: ReaderSceneCache,
): ReaderRuntimeSnapshot {
  const metadata = sceneAccess.getStoryMetadata(cache.storyId);
  const readerScenes = Object.fromEntries(
    cache.cachedSceneIds
      .map((sceneId) => cache.getSceneRecord(sceneId))
      .filter((record): record is SceneRecord => !!record)
      .map((record) => [record.id, toReaderScene(record)]),
  );

  return {
    storiesMetadata: metadata ? [metadata] : [],
    sceneRecordsByStory: Object.keys(readerScenes).length > 0
      ? { [cache.storyId]: readerScenes }
      : {},
  };
}
