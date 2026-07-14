import {
  deleteMediaBlob,
  getMediaBlobStorageKey,
  listMediaBlobKeys,
  listPersistedIndexedDbValues,
} from '@/lib/idb-storage';
import { createPersistentStorage, type StorageLike } from '@/lib/persistent-storage';

const CANDIDATES_KEY = 'vne_media_gc_candidates_v1';
export const WEB_MEDIA_GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

type CleanupDependencies = {
  storage?: StorageLike;
  listMediaKeys?: () => Promise<string[]>;
  listPersistedValues?: () => Promise<string[]>;
  deleteMedia?: (storageKey: string) => Promise<void>;
  now?: () => number;
};

export type WebMediaCleanupResult = {
  deletedKeys: string[];
  failedKeys: string[];
  markedKeys: string[];
};

export function collectReferencedMediaKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const directKey = getMediaBlobStorageKey(value);
    if (directKey) keys.add(directKey);
    else if (value.startsWith('{') || value.startsWith('[')) {
      try {
        collectReferencedMediaKeys(JSON.parse(value), keys);
      } catch {
        // Persisted non-JSON strings cannot contain structured media references.
      }
    }
    return keys;
  }
  if (!value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    for (const item of value) collectReferencedMediaKeys(item, keys);
  } else {
    for (const item of Object.values(value)) collectReferencedMediaKeys(item, keys);
  }
  return keys;
}

function parseCandidates(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

/** Two-pass orphan cleanup: first observation marks; a later pass after grace deletes. */
export async function cleanupOrphanedWebMedia(
  hydratedState: unknown,
  graceMs = WEB_MEDIA_GC_GRACE_MS,
  dependencies: CleanupDependencies = {},
): Promise<WebMediaCleanupResult> {
  const storage = dependencies.storage ?? createPersistentStorage();
  const listMediaKeys = dependencies.listMediaKeys ?? listMediaBlobKeys;
  const listPersistedValues = dependencies.listPersistedValues ?? listPersistedIndexedDbValues;
  const deleteMedia = dependencies.deleteMedia ?? deleteMediaBlob;
  const now = (dependencies.now ?? Date.now)();

  const [mediaKeys, persistedValues, rawCandidates] = await Promise.all([
    listMediaKeys(),
    listPersistedValues(),
    storage.getItem(CANDIDATES_KEY),
  ]);
  const referenced = collectReferencedMediaKeys([hydratedState, persistedValues]);
  const previousCandidates = parseCandidates(rawCandidates);
  const candidates: Record<string, number> = {};
  const result: WebMediaCleanupResult = { deletedKeys: [], failedKeys: [], markedKeys: [] };

  for (const key of mediaKeys) {
    if (referenced.has(key)) continue;
    const firstSeenAt = previousCandidates[key];
    if (firstSeenAt === undefined) {
      candidates[key] = now;
      result.markedKeys.push(key);
      continue;
    }
    if (now - firstSeenAt < graceMs) {
      candidates[key] = firstSeenAt;
      continue;
    }
    try {
      await deleteMedia(key);
      result.deletedKeys.push(key);
    } catch {
      candidates[key] = firstSeenAt;
      result.failedKeys.push(key);
    }
  }

  await storage.setItem(CANDIDATES_KEY, JSON.stringify(candidates));
  return result;
}
