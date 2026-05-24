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

export function createPersistentStorage() {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage;
  }
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  } catch {
    return createNoopStorage();
  }
}
