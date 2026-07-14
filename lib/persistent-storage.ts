import { Platform } from 'react-native';
import { createIndexedDbStorage } from '@/lib/idb-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { showToast } from '@/lib/toast-store';

export type StorageLike = {
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

function createWebStorage(storage: Storage): StorageLike {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

function createSafeWebStorage(storage: StorageLike): StorageLike {
  return {
    getItem: async (key) => {
      try {
        const value = await storage.getItem(key);
        if (key === STORAGE_KEYS.APP_STATE && value) {
          try {
            JSON.parse(value);
          } catch (error) {
            await storage.removeItem(key);
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
    setItem: async (key, value) => {
      try {
        await storage.setItem(key, value);
      } catch (error) {
        showToast('Storage is full. Your latest changes were not saved; existing media was kept.', 'error');
        if (__DEV__) console.warn('[Storage] setItem skipped:', key, error);
      }
    },
    removeItem: async (key) => {
      try {
        await storage.removeItem(key);
      } catch (error) {
        if (__DEV__) console.warn('[Storage] removeItem failed:', key, error);
      }
    },
  };
}

export function createPersistentStorage() {
  if (Platform.OS === 'web') {
    const sourceStorage = typeof localStorage === 'undefined' ? null : localStorage;
    const fallback = sourceStorage ? createWebStorage(sourceStorage) : createNoopStorage();
    const storage = typeof indexedDB === 'undefined'
      ? fallback
      : createIndexedDbStorage(indexedDB, sourceStorage, fallback);
    return createSafeWebStorage(storage);
  }
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  } catch (error) {
    if (__DEV__) console.warn('[Storage] falling back to noop persistent storage:', error);
    return createNoopStorage();
  }
}
