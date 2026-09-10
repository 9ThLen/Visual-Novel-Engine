import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  persistSceneRecordsByStory,
  type SceneRecordStorageLike,
} from '@/lib/scene-record-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { reportAppStateConflict } from '@/lib/app-store-conflict';
import type { AppStorePersistenceState } from '@/lib/app-store-persistence';

type PersistEnvelope = {
  state?: Partial<AppStorePersistenceState>;
  version?: number;
  writeRevision?: number;
};

const APP_STATE_WRITE_LOCK = 'vne_app_state_write';

async function withCrossTabWriteLock<T>(write: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return write();
  return navigator.locks.request(APP_STATE_WRITE_LOCK, write);
}

function parsePersistEnvelope(value: string): PersistEnvelope | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as PersistEnvelope;
  } catch {
    return null;
  }
}

function hasSceneStorageState(state: Partial<AppStorePersistenceState> | undefined): boolean {
  return !!state && (
    Array.isArray(state.storiesMetadata) ||
    (!!state.sceneRecordsByStory && Object.keys(state.sceneRecordsByStory).length > 0)
  );
}

function compactSceneRecords(value: string): string {
  const parsed = parsePersistEnvelope(value);
  if (!parsed?.state) return value;

  return JSON.stringify({
    ...parsed,
    state: {
      ...parsed.state,
      sceneRecordsByStory: {},
      sceneRecordHydration: {},
    },
  });
}

function getPersistableSceneRecordsByStory(
  state: Partial<AppStorePersistenceState>,
): AppStorePersistenceState['sceneRecordsByStory'] {
  const sceneRecordsByStory = state.sceneRecordsByStory ?? {};
  const hydration = state.sceneRecordHydration ?? {};

  return Object.fromEntries(
    Object.entries(sceneRecordsByStory).filter(([storyId]) => hydration[storyId] !== 'window'),
  );
}

async function persistEnvelopeSceneRecords(
  storage: SceneRecordStorageLike,
  value: string,
): Promise<boolean> {
  const parsed = parsePersistEnvelope(value);
  const state = parsed?.state;
  if (!state || !hasSceneStorageState(state)) {
    return false;
  }

  await persistSceneRecordsByStory(
    storage,
    state.storiesMetadata ?? [],
    getPersistableSceneRecordsByStory(state),
  );
  return true;
}

/**
 * What revision of the persisted app state *this tab* last saw.
 *
 * Deliberately outside the factory. It used to be a closure variable, which
 * made it per-wrapper rather than per-tab — and `persistAppStoreStateNow()`
 * builds a fresh wrapper on every call. That wrapper started with no known
 * revision, so it skipped the check, wrote, and bumped the counter; the persist
 * middleware's long-lived wrapper then saw a revision it had not written and
 * reported a cross-tab collision against its own tab. Autosaving a story was
 * enough to trigger it.
 *
 * A tab has one view of one document, so the revision belongs to the tab.
 */
export interface AppStateRevisionTracker {
  get: () => number | null;
  set: (revision: number) => void;
}

/** A fresh view of the persisted revision. One per tab — or per simulated tab. */
export function createAppStateRevisionTracker(): AppStateRevisionTracker {
  let revision: number | null = null;
  return {
    get: () => revision,
    set: (next) => {
      revision = next;
    },
  };
}

const tabRevision = createAppStateRevisionTracker();

/**
 * @param storage the underlying key/value storage
 * @param revisions the caller's view of the persisted revision. Defaults to the
 *   tab-wide tracker; tests pass separate trackers to model separate tabs,
 *   which is the only situation in which two wrappers legitimately disagree.
 */
export function createAppStoreStorage(
  storage: SceneRecordStorageLike = createPersistentStorage() as SceneRecordStorageLike,
  revisions: AppStateRevisionTracker = tabRevision,
): SceneRecordStorageLike {

  return {
    getItem: async (key) => {
      const value = await storage.getItem(key);
      if (key !== STORAGE_KEYS.APP_STATE) return value;
      if (!value) {
        // Nothing persisted yet is still something this tab has seen. Leaving
        // the tracker at whatever it held before would make the next write look
        // like a collision with a tab that had merely been cleared.
        revisions.set(0);
        return value;
      }

      try {
        revisions.set(parsePersistEnvelope(value)?.writeRevision ?? 0);
        const migrated = await persistEnvelopeSceneRecords(storage, value);
        return migrated ? compactSceneRecords(value) : value;
      } catch (error) {
        if (__DEV__) console.warn('[AppStoreStorage] scene migration skipped:', error);
        return value;
      }
    },

    setItem: async (key, value) => {
      if (key !== STORAGE_KEYS.APP_STATE) {
        await storage.setItem(key, value);
        return;
      }

      await withCrossTabWriteLock(async () => {
        const currentValue = await storage.getItem(key);
        const currentRevision = currentValue
          ? parsePersistEnvelope(currentValue)?.writeRevision ?? 0
          : 0;
        const lastKnownRevision = revisions.get();
        if (lastKnownRevision !== null && currentRevision !== lastKnownRevision) {
          // Refuse the write — overwriting would discard whatever the other tab
          // saved — but report it instead of throwing. Nothing awaits this
          // promise, so a rejection here reached the author as an uncaught
          // error overlay in development and as silence in production.
          reportAppStateConflict();
          return;
        }

        const parsed = parsePersistEnvelope(value);
        const revision = currentRevision + 1;
        const revisionedValue = parsed
          ? JSON.stringify({ ...parsed, writeRevision: revision })
          : value;
        try {
          const persistedScenes = await persistEnvelopeSceneRecords(storage, revisionedValue);
          await storage.setItem(key, persistedScenes ? compactSceneRecords(revisionedValue) : revisionedValue);
          revisions.set(revision);
        } catch (error) {
          if (__DEV__) console.warn('[AppStoreStorage] storing full app state fallback:', error);
          await storage.setItem(key, revisionedValue);
          revisions.set(revision);
        }
      });
    },

    removeItem: (key) => storage.removeItem(key),
  };
}
