/**
 * Whether the browser has promised to keep the stories.
 *
 * Everything this app writes on the web lives in IndexedDB, and by default that
 * is *best-effort* storage: under disk pressure a browser may evict a whole
 * origin without asking, taking every story with it. `navigator.storage.persist()`
 * asks for the *persistent* mode instead, which is not evicted automatically.
 *
 * Chrome grants it silently to sites the user has engaged with, Firefox prompts,
 * Safari grants it on a similar heuristic. So the request cannot be trusted to
 * succeed, and the honest thing is to ask once, report what the answer was, and
 * let the author see how much they are storing.
 *
 * Native platforms have no such notion — files are files — so everything here
 * reports "not applicable" off the web.
 */

import { Platform } from 'react-native';

export type StorageDurability =
  /** Not the web: the question does not arise. */
  | { kind: 'not-applicable' }
  /** A web browser too old for the Storage API. */
  | { kind: 'unsupported' }
  /** Eviction is possible. `used`/`quota` are bytes, absent when unreported. */
  | { kind: 'best-effort'; used?: number; quota?: number }
  /** The browser has promised not to evict this origin. */
  | { kind: 'persisted'; used?: number; quota?: number };

function storageManager(): StorageManager | null {
  if (Platform.OS !== 'web') return null;
  if (typeof navigator === 'undefined' || !navigator.storage) return null;
  return navigator.storage;
}

async function readEstimate(manager: StorageManager): Promise<{ used?: number; quota?: number }> {
  if (typeof manager.estimate !== 'function') return {};
  try {
    const estimate = await manager.estimate();
    return {
      ...(typeof estimate.usage === 'number' ? { used: estimate.usage } : {}),
      ...(typeof estimate.quota === 'number' ? { quota: estimate.quota } : {}),
    };
  } catch {
    // An estimate is a nicety; failing to read one says nothing about durability.
    return {};
  }
}

/** What the browser currently promises, and how much is stored. */
export async function readStorageDurability(): Promise<StorageDurability> {
  const manager = storageManager();
  if (!manager) return { kind: Platform.OS === 'web' ? 'unsupported' : 'not-applicable' };
  if (typeof manager.persisted !== 'function') return { kind: 'unsupported' };

  const estimate = await readEstimate(manager);
  try {
    return { kind: (await manager.persisted()) ? 'persisted' : 'best-effort', ...estimate };
  } catch {
    return { kind: 'best-effort', ...estimate };
  }
}

/**
 * Ask the browser to stop evicting this origin.
 *
 * Returns the state afterwards rather than a bare boolean: a refusal is not an
 * error and the caller has to show something either way. Asking again after a
 * refusal is harmless — Chrome re-evaluates as the user engages with the site.
 */
export async function requestStorageDurability(): Promise<StorageDurability> {
  const manager = storageManager();
  if (!manager || typeof manager.persist !== 'function') return readStorageDurability();

  try {
    await manager.persist();
  } catch {
    // Denied or unavailable; the state read below is what actually matters.
  }
  return readStorageDurability();
}

/** Bytes as something an author can read; whole units, never "0.00 GB". */
export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
