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
};

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
  return {
    getItem: async (key) => {
      const value = await storage.getItem(key);
      if (key !== STORAGE_KEYS.APP_STATE || !value) {
        return value;
      }

      try {
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

      try {
        const persistedScenes = await persistEnvelopeSceneRecords(storage, value);
        await storage.setItem(key, persistedScenes ? compactSceneRecords(value) : value);
      } catch (error) {
        if (__DEV__) console.warn('[AppStoreStorage] storing full app state fallback:', error);
        await storage.setItem(key, value);
      }
    },

    removeItem: (key) => storage.removeItem(key),
  };
}
