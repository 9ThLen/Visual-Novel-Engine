import type {
  BackgroundBlockData,
  DialogueBlockData,
  SceneConnection,
  SceneRecord,
  TextBlockData,
  TimelineStep,
} from '@/lib/engine/types';
import type { AudioTrigger } from '@/lib/audio-types';
import { getSceneRecordFromAccess, type SceneAccessSnapshot } from '@/lib/scene-access';

export interface ReaderScene {
  id: string;
  storyId: string;
  name: string;
  timeline: TimelineStep[];
  voiceAudioUri?: string | null;
  audioTriggers?: AudioTrigger[];
  connections: SceneConnection[];
  isStart: boolean;
}

export interface SaveSlotSceneMeta {
  sceneName: string;
  thumbnailUri?: string;
  sceneText: string;
}

export function toReaderScene(record: SceneRecord): ReaderScene {
  return {
    id: record.id,
    storyId: record.storyId,
    name: record.name,
    timeline: record.timeline,
    voiceAudioUri: record.voiceAudioUri ?? null,
    audioTriggers: record.audioTriggers ?? [],
    connections: record.connections,
    isStart: record.isStart,
  };
}

export function toReaderSceneMap(
  recordsByStory: Record<string, Record<string, SceneRecord>>,
): Record<string, Record<string, ReaderScene>> {
  return Object.fromEntries(
    Object.entries(recordsByStory).map(([storyId, records]) => [
      storyId,
      Object.fromEntries(
        Object.entries(records).map(([sceneId, record]) => [sceneId, toReaderScene(record)]),
      ),
    ]),
  );
}

const readerSceneCache = new WeakMap<SceneRecord, ReaderScene>();

/**
 * Reference-stable projection. toReaderScene() builds a new object on every
 * call, and a Zustand selector that returns a fresh object makes
 * useSyncExternalStore believe the snapshot changed on every render — which
 * ends in an infinite render loop. Caching per record identity keeps the
 * projection at the boundary without paying that cost.
 */
export function toStableReaderScene(record: SceneRecord): ReaderScene {
  const cached = readerSceneCache.get(record);
  if (cached) return cached;
  const scene = toReaderScene(record);
  readerSceneCache.set(record, scene);
  return scene;
}

/**
 * Canonical reader entry point into stored scenes: callers receive a
 * ReaderScene and never handle the storage shape themselves.
 */
export function getReaderSceneFromAccess(
  snapshot: Pick<SceneAccessSnapshot, 'sceneRecordsByStory'>,
  storyId: string,
  sceneId: string,
): ReaderScene | undefined {
  const record = getSceneRecordFromAccess(snapshot, storyId, sceneId);
  return record ? toStableReaderScene(record) : undefined;
}

export function getReaderScenePreviewText(scene: ReaderScene): string {
  for (const step of scene.timeline) {
    if (!step.enabled) continue;
    if (step.blockType === 'text') {
      const data = step.data as TextBlockData;
      return data.content.split('\n')[0]?.slice(0, 100) || '';
    }
    if (step.blockType === 'dialogue') {
      const data = step.data as DialogueBlockData;
      return data.entries[0]?.text?.split('\n')[0]?.slice(0, 100) || '';
    }
  }
  return '';
}

export function getReaderSceneThumbnailUri(scene: ReaderScene): string | undefined {
  const background = scene.timeline.find((step) => step.enabled && step.blockType === 'background');
  const assetId = background ? (background.data as BackgroundBlockData).assetId : null;
  return assetId ?? undefined;
}

export function toSaveSlotMeta(scene: ReaderScene): SaveSlotSceneMeta {
  return {
    sceneName: scene.name || scene.id,
    thumbnailUri: getReaderSceneThumbnailUri(scene),
    sceneText: getReaderScenePreviewText(scene),
  };
}
