// Mock for @react-native-async-storage/async-storage that works in Node.js environment
// This avoids the "window is not defined" error when AsyncStorage tries to load

const storage = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string) => {
    return storage.get(key) ?? null;
  },
  
  setItem: async (key: string, value: string) => {
    storage.set(key, value);
  },
  
  removeItem: async (key: string) => {
    storage.delete(key);
  },
  
  clear: async () => {
    storage.clear();
  },
  
  getAllKeys: async () => {
    return Array.from(storage.keys());
  },
  
  multiGet: async (keys: string[]) => {
    return keys.map(key => [key, storage.get(key) ?? null]);
  },
  
  multiSet: async (pairs: [string, string][]) => {
    pairs.forEach(([key, value]) => storage.set(key, value));
  },
  
  multiRemove: async (keys: string[]) => {
    keys.forEach(key => storage.delete(key));
  },
};

export default AsyncStorage;
