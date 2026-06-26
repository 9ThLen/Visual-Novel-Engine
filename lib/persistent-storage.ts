import { Platform } from 'react-native';

type StorageLike = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

function createNoopStorage(): StorageLike {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function compactPersistedAppState(value: string): string | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || !parsed.state || typeof parsed.state !== 'object') {
      return null;
    }

    return JSON.stringify({
      ...parsed,
      state: {
        ...parsed.state,
        mediaLibrary: [],
      },
    });
  } catch {
    return null;
  }
}

function createSafeWebStorage(storage: Storage): StorageLike {
  return {
    getItem: (key) => {
      try {
        const value = storage.getItem(key);
        if (key === 'vne_app_state' && value) {
          try {
            JSON.parse(value);
          } catch (error) {
            storage.removeItem(key);
            if (__DEV__) console.warn('[Storage] removed invalid app state:', error);
            return null;
          }
        }
        return value;
      } catch (error) {
        if (__DEV__) console.warn('[Storage] getItem failed:', key, error);
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        storage.setItem(key, value);
      } catch (error) {
        const compactedValue = key === 'vne_app_state' ? compactPersistedAppState(value) : null;
        if (compactedValue) {
          try {
            storage.setItem(key, compactedValue);
            return;
          } catch {
          }
        }

        if (__DEV__) console.warn('[Storage] setItem skipped:', key, error);
      }
    },
    removeItem: (key) => {
      try {
        storage.removeItem(key);
      } catch (error) {
        if (__DEV__) console.warn('[Storage] removeItem failed:', key, error);
      }
    },
  };
}

export function createPersistentStorage() {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return createSafeWebStorage(localStorage);
  }
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  } catch (error) {
    if (__DEV__) console.warn('[Storage] falling back to noop persistent storage:', error);
    return createNoopStorage();
  }
}
