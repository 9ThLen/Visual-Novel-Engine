import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  persistSceneRecordsByStory,
  type SceneRecordStorageLike,
} from '@/lib/scene-record-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
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

export function createAppStoreStorage(
  storage: SceneRecordStorageLike = createPersistentStorage() as SceneRecordStorageLike,
): SceneRecordStorageLike {
  let lastKnownRevision: number | null = null;

  return {
    getItem: async (key) => {
      const value = await storage.getItem(key);
      if (key !== STORAGE_KEYS.APP_STATE || !value) {
        return value;
      }

      try {
        lastKnownRevision = parsePersistEnvelope(value)?.writeRevision ?? 0;
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
        if (lastKnownRevision !== null && currentRevision !== lastKnownRevision) {
          throw new Error('App state changed in another tab; reload before continuing');
        }

        const parsed = parsePersistEnvelope(value);
        const revision = currentRevision + 1;
        const revisionedValue = parsed
          ? JSON.stringify({ ...parsed, writeRevision: revision })
          : value;
        try {
          const persistedScenes = await persistEnvelopeSceneRecords(storage, revisionedValue);
          await storage.setItem(key, persistedScenes ? compactSceneRecords(revisionedValue) : revisionedValue);
          lastKnownRevision = revision;
        } catch (error) {
          if (__DEV__) console.warn('[AppStoreStorage] storing full app state fallback:', error);
          await storage.setItem(key, revisionedValue);
          lastKnownRevision = revision;
        }
      });
    },

    removeItem: (key) => storage.removeItem(key),
  };
}
