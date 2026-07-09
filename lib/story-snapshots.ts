// story-snapshots.ts — local, network-free version snapshots for a story.
//
// A snapshot is a full copy of a story's scene records (plus a small metadata
// subset) captured at a point in time, so an author can roll back a bad
// editing session. Storage layout mirrors the canonical scene-record storage:
//   - one index key per story  → SnapshotMeta[] (no bodies; cheap to list)
//   - one manifest key per snapshot → the scene ids + metadata subset
//   - one key per snapshot scene    → a single SceneRecord
// Bodies are never stored in one giant blob, and listing never reads them.

import type { SceneRecord } from '@/lib/engine/types';
import type { SceneRecordStorageLike } from '@/lib/scene-record-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { computeStoryStats } from '@/lib/story-stats';

export const STORY_SNAPSHOT_STORAGE_VERSION = 1;

/** Keep at most this many snapshots per story; creating another evicts one. */
export const MAX_SNAPSHOTS_PER_STORY = 10;

/** Lightweight metadata shown in listings — never carries scene bodies. */
export interface SnapshotMeta {
  id: string;
  name: string;
  createdAt: number;
  sceneCount: number;
  words: number;
  /** Snapshots created automatically (e.g. before a restore) are evicted first. */
  automatic: boolean;
}

/** Small subset of story metadata preserved alongside the scenes. */
export interface SnapshotStoryMetadata {
  title?: string;
  startSceneId?: string | null;
  sceneOrder?: string[];
  tags?: string[];
}

export interface CreateSnapshotOptions {
  automatic?: boolean;
  story?: SnapshotStoryMetadata | null;
  /** Injectable for deterministic tests. */
  now?: number;
  id?: string;
}

interface StorySnapshotIndex {
  version: number;
  storyId: string;
  snapshots: SnapshotMeta[];
}

interface StorySnapshotManifest {
  version: number;
  storyId: string;
  snapshotId: string;
  meta: SnapshotMeta;
  story: SnapshotStoryMetadata | null;
  sceneIds: string[];
}

interface StorySnapshotScenePayload {
  version: number;
  storyId: string;
  snapshotId: string;
  record: SceneRecord;
}

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

function parseSnapshotMeta(value: unknown): SnapshotMeta | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  return {
    id: value.id,
    name: value.name,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
    sceneCount: typeof value.sceneCount === 'number' ? value.sceneCount : 0,
    words: typeof value.words === 'number' ? value.words : 0,
    automatic: value.automatic === true,
  };
}

function parseStorySnapshotIndex(raw: unknown, storyId: string): StorySnapshotIndex {
  let index: unknown = raw;
  if (typeof raw === 'string') {
    try {
      index = JSON.parse(raw);
    } catch {
      return { version: STORY_SNAPSHOT_STORAGE_VERSION, storyId, snapshots: [] };
    }
  }
  if (!isRecord(index) || !Array.isArray(index.snapshots)) {
    return { version: STORY_SNAPSHOT_STORAGE_VERSION, storyId, snapshots: [] };
  }
  return {
    version:
      typeof index.version === 'number' ? index.version : STORY_SNAPSHOT_STORAGE_VERSION,
    storyId,
    snapshots: index.snapshots
      .map(parseSnapshotMeta)
      .filter((meta): meta is SnapshotMeta => !!meta),
  };
}

function parseStorySnapshotManifest(
  raw: unknown,
  expectedStoryId: string,
  expectedSnapshotId: string,
): StorySnapshotManifest | null {
  let manifest: unknown = raw;
  if (typeof raw === 'string') {
    try {
      manifest = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (
    !isRecord(manifest) ||
    manifest.storyId !== expectedStoryId ||
    manifest.snapshotId !== expectedSnapshotId ||
    !Array.isArray(manifest.sceneIds)
  ) {
    return null;
  }
  const meta = parseSnapshotMeta(manifest.meta);
  if (!meta) return null;
  return {
    version:
      typeof manifest.version === 'number'
        ? manifest.version
        : STORY_SNAPSHOT_STORAGE_VERSION,
    storyId: expectedStoryId,
    snapshotId: expectedSnapshotId,
    meta,
    story: isRecord(manifest.story) ? (manifest.story as SnapshotStoryMetadata) : null,
    sceneIds: manifest.sceneIds.filter((id): id is string => typeof id === 'string'),
  };
}

function parseStorySnapshotScene(
  raw: unknown,
  expectedStoryId: string,
  expectedSnapshotId: string,
): SceneRecord | null {
  let payload: unknown = raw;
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (
    !isRecord(payload) ||
    payload.storyId !== expectedStoryId ||
    payload.snapshotId !== expectedSnapshotId ||
    !hasSceneRecordShape(payload.record)
  ) {
    return null;
  }
  return payload.record;
}

function generateSnapshotId(now: number): string {
  return `snap-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Choose which existing snapshot to evict when over the cap. Oldest automatic
 * snapshot first; only if none are automatic does the oldest named one go.
 */
function selectEvictionVictim(snapshots: SnapshotMeta[]): SnapshotMeta | null {
  if (snapshots.length === 0) return null;
  const byAgeAsc = [...snapshots].sort((a, b) => a.createdAt - b.createdAt);
  return byAgeAsc.find((snapshot) => snapshot.automatic) ?? byAgeAsc[0];
}

async function deleteSnapshotBodies(
  storage: SceneRecordStorageLike,
  storyId: string,
  snapshotId: string,
): Promise<void> {
  const manifest = parseStorySnapshotManifest(
    await storage.getItem(STORAGE_KEYS.STORY_SNAPSHOT_MANIFEST(storyId, snapshotId)),
    storyId,
    snapshotId,
  );
  const sceneIds = manifest?.sceneIds ?? [];
  await Promise.all([
    ...sceneIds.map((sceneId) =>
      storage.removeItem(STORAGE_KEYS.STORY_SNAPSHOT_SCENE(storyId, snapshotId, sceneId)),
    ),
    storage.removeItem(STORAGE_KEYS.STORY_SNAPSHOT_MANIFEST(storyId, snapshotId)),
  ]);
}

/**
 * Capture a full copy of `scenes` as a named snapshot for `storyId`. Writes the
 * scene bodies and manifest, then updates the per-story index, evicting the
 * oldest automatic (or, failing that, oldest named) snapshot past the cap.
 */
export async function createSnapshot(
  storage: SceneRecordStorageLike,
  storyId: string,
  name: string,
  scenes: SceneRecord[],
  options: CreateSnapshotOptions = {},
): Promise<SnapshotMeta> {
  const now = options.now ?? Date.now();
  const snapshotId = options.id ?? generateSnapshotId(now);
  const stats = computeStoryStats(scenes);
  const meta: SnapshotMeta = {
    id: snapshotId,
    name: name.trim() || snapshotId,
    createdAt: now,
    sceneCount: scenes.length,
    words: stats.words,
    automatic: options.automatic ?? false,
  };

  // 1. Bodies first: per-scene payloads, then the manifest that lists them.
  await Promise.all(
    scenes.map((record) => {
      const payload: StorySnapshotScenePayload = {
        version: STORY_SNAPSHOT_STORAGE_VERSION,
        storyId,
        snapshotId,
        record,
      };
      return storage.setItem(
        STORAGE_KEYS.STORY_SNAPSHOT_SCENE(storyId, snapshotId, record.id),
        JSON.stringify(payload),
      );
    }),
  );
  const manifest: StorySnapshotManifest = {
    version: STORY_SNAPSHOT_STORAGE_VERSION,
    storyId,
    snapshotId,
    meta,
    story: options.story ?? null,
    sceneIds: scenes.map((record) => record.id),
  };
  await storage.setItem(
    STORAGE_KEYS.STORY_SNAPSHOT_MANIFEST(storyId, snapshotId),
    JSON.stringify(manifest),
  );

  // 2. Index: append, then enforce the cap by evicting existing entries.
  const index = parseStorySnapshotIndex(
    await storage.getItem(STORAGE_KEYS.STORY_SNAPSHOT_INDEX(storyId)),
    storyId,
  );
  let snapshots = [...index.snapshots.filter((s) => s.id !== snapshotId), meta];
  while (snapshots.length > MAX_SNAPSHOTS_PER_STORY) {
    // Never evict the snapshot we just created.
    const victim = selectEvictionVictim(snapshots.filter((s) => s.id !== snapshotId));
    if (!victim) break;
    snapshots = snapshots.filter((s) => s.id !== victim.id);
    await deleteSnapshotBodies(storage, storyId, victim.id);
  }
  await writeIndex(storage, storyId, snapshots);

  return meta;
}

async function writeIndex(
  storage: SceneRecordStorageLike,
  storyId: string,
  snapshots: SnapshotMeta[],
): Promise<void> {
  const index: StorySnapshotIndex = {
    version: STORY_SNAPSHOT_STORAGE_VERSION,
    storyId,
    snapshots,
  };
  await storage.setItem(
    STORAGE_KEYS.STORY_SNAPSHOT_INDEX(storyId),
    JSON.stringify(index),
  );
}

/**
 * List snapshot metadata for a story, newest first. Reads only the index key —
 * never a manifest or scene body.
 */
export async function listSnapshots(
  storage: SceneRecordStorageLike,
  storyId: string,
): Promise<SnapshotMeta[]> {
  const index = parseStorySnapshotIndex(
    await storage.getItem(STORAGE_KEYS.STORY_SNAPSHOT_INDEX(storyId)),
    storyId,
  );
  return [...index.snapshots].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Rebuild the full scene set from a snapshot. Reads the manifest and every
 * scene body up front; if any scene is missing or unreadable it throws before
 * returning, so a caller never receives a half-restored story.
 */
export async function restoreSnapshot(
  storage: SceneRecordStorageLike,
  storyId: string,
  snapshotId: string,
): Promise<SceneRecord[]> {
  const manifest = parseStorySnapshotManifest(
    await storage.getItem(STORAGE_KEYS.STORY_SNAPSHOT_MANIFEST(storyId, snapshotId)),
    storyId,
    snapshotId,
  );
  if (!manifest) {
    throw new Error(`Snapshot not found: ${storyId}/${snapshotId}`);
  }

  const rawScenes = await Promise.all(
    manifest.sceneIds.map((sceneId) =>
      storage.getItem(STORAGE_KEYS.STORY_SNAPSHOT_SCENE(storyId, snapshotId, sceneId)),
    ),
  );
  const scenes = rawScenes.map((raw) => parseStorySnapshotScene(raw, storyId, snapshotId));
  if (scenes.some((scene) => scene === null)) {
    throw new Error(`Snapshot is incomplete: ${storyId}/${snapshotId}`);
  }
  return scenes as SceneRecord[];
}

/** Delete a snapshot's bodies and remove it from the story's index. */
export async function deleteSnapshot(
  storage: SceneRecordStorageLike,
  storyId: string,
  snapshotId: string,
): Promise<void> {
  await deleteSnapshotBodies(storage, storyId, snapshotId);
  const index = parseStorySnapshotIndex(
    await storage.getItem(STORAGE_KEYS.STORY_SNAPSHOT_INDEX(storyId)),
    storyId,
  );
  await writeIndex(
    storage,
    storyId,
    index.snapshots.filter((snapshot) => snapshot.id !== snapshotId),
  );
}
