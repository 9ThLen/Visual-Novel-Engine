import type { SceneRecord } from '@/lib/engine/types';
import { migrateSceneRecord, migrateSceneRecordMap } from '@/lib/audio-block-migration';
import { getScenePrefetchSceneIds } from '@/lib/reader-scene-cache';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import type { StoryMetadata } from '@/lib/story-domain';

export const SCENE_RECORD_STORAGE_VERSION = 1;

export type SceneRecordsByStory = Record<string, Record<string, SceneRecord>>;

export interface SceneRecordStorageIndex {
  version: number;
  storyIds: string[];
}

export interface SceneRecordStoragePayload {
  version: number;
  storyId: string;
  records: Record<string, SceneRecord>;
  updatedAt: number;
}

export interface SceneRecordItemIndex {
  version: number;
  storyId: string;
  sceneIds: string[];
  updatedAt: number;
}

export interface SceneRecordItemPayload {
  version: number;
  storyId: string;
  sceneId: string;
  record: SceneRecord;
  updatedAt: number;
}

export interface SceneRecordStorageEntry {
  key: string;
  storyId: string;
  payload: SceneRecordStoragePayload;
}

export type SceneRecordStorageLike = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function hasSceneRecordShape(value: unknown): value is SceneRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.storyId === 'string' &&
    Array.isArray(value.timeline) &&
    isRecord(value.sceneState)
  );
}

function normalizeSceneRecordMap(
  storyId: string,
  records: unknown,
): Record<string, SceneRecord> {
  if (!isRecord(records)) return {};

  const normalized = Object.fromEntries(
    Object.entries(records).filter(([sceneId, record]) => {
      return sceneId === (record as Partial<SceneRecord> | null)?.id &&
        hasSceneRecordShape(record) &&
        record.storyId === storyId;
    }),
  ) as Record<string, SceneRecord>;

  return migrateSceneRecordMap(normalized);
}

export function getSceneRecordStorageKey(storyId: string): string {
  return STORAGE_KEYS.CANONICAL_SCENE_RECORDS(storyId);
}

export function getSceneRecordIdIndexStorageKey(storyId: string): string {
  return STORAGE_KEYS.CANONICAL_SCENE_RECORD_IDS(storyId);
}

export function getSceneRecordItemStorageKey(storyId: string, sceneId: string): string {
  return STORAGE_KEYS.CANONICAL_SCENE_RECORD(storyId, sceneId);
}

export function parseSceneRecordStorageIndex(rawIndex: unknown): SceneRecordStorageIndex {
  let index: unknown = rawIndex;
  if (typeof rawIndex === 'string') {
    try {
      index = JSON.parse(rawIndex);
    } catch {
      return { version: SCENE_RECORD_STORAGE_VERSION, storyIds: [] };
    }
  }

  if (!isRecord(index) || !Array.isArray(index.storyIds)) {
    return { version: SCENE_RECORD_STORAGE_VERSION, storyIds: [] };
  }

  return {
    version: typeof index.version === 'number' ? index.version : SCENE_RECORD_STORAGE_VERSION,
    storyIds: [...new Set(index.storyIds.filter((storyId): storyId is string => typeof storyId === 'string'))],
  };
}

export function parseSceneRecordItemIndex(
  rawIndex: unknown,
  expectedStoryId?: string,
): SceneRecordItemIndex | null {
  let index: unknown = rawIndex;
  if (typeof rawIndex === 'string') {
    try {
      index = JSON.parse(rawIndex);
    } catch {
      return null;
    }
  }

  if (!isRecord(index) || typeof index.storyId !== 'string' || !Array.isArray(index.sceneIds)) {
    return null;
  }
  if (expectedStoryId && index.storyId !== expectedStoryId) {
    return null;
  }

  return {
    version: typeof index.version === 'number' ? index.version : SCENE_RECORD_STORAGE_VERSION,
    storyId: index.storyId,
    sceneIds: [
      ...new Set(index.sceneIds.filter((sceneId): sceneId is string => typeof sceneId === 'string')),
    ],
    updatedAt: typeof index.updatedAt === 'number' ? index.updatedAt : 0,
  };
}

export function buildSceneRecordStorageIndex(
  storiesMetadata: StoryMetadata[],
  sceneRecordsByStory: SceneRecordsByStory,
): SceneRecordStorageIndex {
  const storyIds = [
    ...new Set([
      ...storiesMetadata.map((story) => story.id),
      ...Object.keys(sceneRecordsByStory),
    ]),
  ];

  return {
    version: SCENE_RECORD_STORAGE_VERSION,
    storyIds,
  };
}

export function buildSceneRecordItemIndex(
  storyId: string,
  records: Record<string, SceneRecord>,
  updatedAt = Date.now(),
): SceneRecordItemIndex {
  return {
    version: SCENE_RECORD_STORAGE_VERSION,
    storyId,
    sceneIds: Object.keys(normalizeSceneRecordMap(storyId, records)),
    updatedAt,
  };
}

export function buildSceneRecordStoragePayload(
  storyId: string,
  records: Record<string, SceneRecord>,
  updatedAt = Date.now(),
): SceneRecordStoragePayload {
  return {
    version: SCENE_RECORD_STORAGE_VERSION,
    storyId,
    records: normalizeSceneRecordMap(storyId, records),
    updatedAt,
  };
}

export function buildSceneRecordItemPayload(
  storyId: string,
  sceneId: string,
  record: SceneRecord,
  updatedAt = Date.now(),
): SceneRecordItemPayload | null {
  if (record.id !== sceneId || record.storyId !== storyId || !hasSceneRecordShape(record)) {
    return null;
  }

  return {
    version: SCENE_RECORD_STORAGE_VERSION,
    storyId,
    sceneId,
    record: migrateSceneRecord(record),
    updatedAt,
  };
}

export function buildSceneRecordStorageEntries(
  sceneRecordsByStory: SceneRecordsByStory,
  updatedAt = Date.now(),
): SceneRecordStorageEntry[] {
  return Object.entries(sceneRecordsByStory).map(([storyId, records]) => ({
    key: getSceneRecordStorageKey(storyId),
    storyId,
    payload: buildSceneRecordStoragePayload(storyId, records, updatedAt),
  }));
}

export function parseSceneRecordItemPayload(
  rawPayload: unknown,
  expectedStoryId?: string,
  expectedSceneId?: string,
): SceneRecordItemPayload | null {
  let payload: unknown = rawPayload;
  if (typeof rawPayload === 'string') {
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      return null;
    }
  }
  if (
    !isRecord(payload) ||
    typeof payload.storyId !== 'string' ||
    typeof payload.sceneId !== 'string' ||
    !hasSceneRecordShape(payload.record)
  ) {
    return null;
  }
  if (
    payload.record.storyId !== payload.storyId ||
    payload.record.id !== payload.sceneId ||
    (expectedStoryId && payload.storyId !== expectedStoryId) ||
    (expectedSceneId && payload.sceneId !== expectedSceneId)
  ) {
    return null;
  }

  return {
    version:
      typeof payload.version === 'number' ? payload.version : SCENE_RECORD_STORAGE_VERSION,
    storyId: payload.storyId,
    sceneId: payload.sceneId,
    record: migrateSceneRecord(payload.record),
    updatedAt: typeof payload.updatedAt === 'number' ? payload.updatedAt : 0,
  };
}

export function parseSceneRecordStoragePayload(
  rawPayload: unknown,
): SceneRecordStoragePayload | null {
  let payload: unknown = rawPayload;
  if (typeof rawPayload === 'string') {
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      return null;
    }
  }
  if (!isRecord(payload) || typeof payload.storyId !== 'string') {
    return null;
  }

  return {
    version:
      typeof payload.version === 'number' ? payload.version : SCENE_RECORD_STORAGE_VERSION,
    storyId: payload.storyId,
    records: normalizeSceneRecordMap(payload.storyId, payload.records),
    updatedAt: typeof payload.updatedAt === 'number' ? payload.updatedAt : 0,
  };
}

export function mergeSceneRecordStoragePayloads(
  payloads: unknown[],
): SceneRecordsByStory {
  return Object.fromEntries(
    payloads
      .map((payload) => parseSceneRecordStoragePayload(payload))
      .filter((payload): payload is SceneRecordStoragePayload => !!payload)
      .map((payload) => [payload.storyId, payload.records] as const),
  );
}

export async function persistSceneRecordsByStory(
  storage: SceneRecordStorageLike,
  storiesMetadata: StoryMetadata[],
  sceneRecordsByStory: SceneRecordsByStory,
): Promise<void> {
  const previousIndex = parseSceneRecordStorageIndex(
    await storage.getItem(STORAGE_KEYS.CANONICAL_SCENE_RECORD_INDEX),
  );
  const nextIndex = buildSceneRecordStorageIndex(storiesMetadata, sceneRecordsByStory);
  const nextStoryIds = new Set(nextIndex.storyIds);
  const staleStoryIds = previousIndex.storyIds.filter((storyId) => !nextStoryIds.has(storyId));
  const updatedAt = Date.now();
  const itemIndexStoryIds = [
    ...new Set([...previousIndex.storyIds, ...Object.keys(sceneRecordsByStory)]),
  ];
  const previousItemIndexes = await Promise.all(
    itemIndexStoryIds.map(async (storyId) => [
      storyId,
      parseSceneRecordItemIndex(
        await storage.getItem(getSceneRecordIdIndexStorageKey(storyId)),
        storyId,
      ),
    ] as const),
  );
  const previousItemIndexByStory = Object.fromEntries(previousItemIndexes);

  await Promise.all([
    ...staleStoryIds.map((storyId) => storage.removeItem(getSceneRecordStorageKey(storyId))),
    ...staleStoryIds.map((storyId) => storage.removeItem(getSceneRecordIdIndexStorageKey(storyId))),
    ...staleStoryIds.flatMap((storyId) =>
      (previousItemIndexByStory[storyId]?.sceneIds ?? []).map((sceneId) =>
        storage.removeItem(getSceneRecordItemStorageKey(storyId, sceneId)),
      ),
    ),
    ...buildSceneRecordStorageEntries(sceneRecordsByStory).map((entry) =>
      storage.setItem(entry.key, JSON.stringify(entry.payload)),
    ),
    ...Object.entries(sceneRecordsByStory).flatMap(([storyId, records]) => {
      const normalizedRecords = normalizeSceneRecordMap(storyId, records);
      const nextSceneIds = new Set(Object.keys(normalizedRecords));
      const previousSceneIds = previousItemIndexByStory[storyId]?.sceneIds ?? [];
      const staleSceneIds = previousSceneIds.filter((sceneId) => !nextSceneIds.has(sceneId));
      const index = buildSceneRecordItemIndex(storyId, normalizedRecords, updatedAt);

      return [
        ...staleSceneIds.map((sceneId) =>
          storage.removeItem(getSceneRecordItemStorageKey(storyId, sceneId)),
        ),
        ...Object.entries(normalizedRecords).flatMap(([sceneId, record]) => {
          const payload = buildSceneRecordItemPayload(storyId, sceneId, record, updatedAt);
          return payload
            ? [storage.setItem(getSceneRecordItemStorageKey(storyId, sceneId), JSON.stringify(payload))]
            : [];
        }),
        storage.setItem(getSceneRecordIdIndexStorageKey(storyId), JSON.stringify(index)),
      ];
    }),
    storage.setItem(STORAGE_KEYS.CANONICAL_SCENE_RECORD_INDEX, JSON.stringify(nextIndex)),
  ]);
}

export async function loadSceneRecordsForStory(
  storage: SceneRecordStorageLike,
  storyId: string,
): Promise<Record<string, SceneRecord>> {
  const payload = parseSceneRecordStoragePayload(
    await storage.getItem(getSceneRecordStorageKey(storyId)),
  );

  return payload?.records ?? {};
}

export async function loadSceneRecordForStory(
  storage: SceneRecordStorageLike,
  storyId: string,
  sceneId: string,
): Promise<SceneRecord | null> {
  const itemPayload = parseSceneRecordItemPayload(
    await storage.getItem(getSceneRecordItemStorageKey(storyId, sceneId)),
    storyId,
    sceneId,
  );
  if (itemPayload) {
    return itemPayload.record;
  }

  const records = await loadSceneRecordsForStory(storage, storyId);
  return records[sceneId] ?? null;
}

export async function loadReaderSceneRecordWindow(
  storage: SceneRecordStorageLike,
  storyId: string,
  sceneId: string,
  maxPrefetchScenes = 4,
): Promise<Record<string, SceneRecord>> {
  let fallbackRecords: Record<string, SceneRecord> | null = null;
  const loadScene = async (targetSceneId: string): Promise<SceneRecord | null> => {
    const itemPayload = parseSceneRecordItemPayload(
      await storage.getItem(getSceneRecordItemStorageKey(storyId, targetSceneId)),
      storyId,
      targetSceneId,
    );
    if (itemPayload) {
      return itemPayload.record;
    }

    fallbackRecords ??= await loadSceneRecordsForStory(storage, storyId);
    return fallbackRecords[targetSceneId] ?? null;
  };

  const currentScene = await loadScene(sceneId);
  if (!currentScene) {
    return {};
  }

  const records: Record<string, SceneRecord> = {
    [currentScene.id]: currentScene,
  };
  const prefetchSceneIds = getScenePrefetchSceneIds(currentScene).slice(0, maxPrefetchScenes);
  const prefetchedScenes = await Promise.all(prefetchSceneIds.map((id) => loadScene(id)));
  for (const scene of prefetchedScenes) {
    if (scene) {
      records[scene.id] = scene;
    }
  }

  return records;
}

export async function loadSceneRecordsByStoryFromIndex(
  storage: SceneRecordStorageLike,
): Promise<SceneRecordsByStory> {
  const index = parseSceneRecordStorageIndex(
    await storage.getItem(STORAGE_KEYS.CANONICAL_SCENE_RECORD_INDEX),
  );
  const payloads = await Promise.all(
    index.storyIds.map((storyId) => storage.getItem(getSceneRecordStorageKey(storyId))),
  );

  return mergeSceneRecordStoragePayloads(payloads);
}
