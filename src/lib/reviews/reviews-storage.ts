/**
 * Binds the review store to the app's real persistence (IndexedDB on web,
 * AsyncStorage on native) via the same factory the zustand persist uses.
 */

import { createPersistentStorage } from '@/lib/persistent-storage';
import { createReviewsStore, type KVStorage } from '@/lib/reviews/reviews-store';

function appKVStorage(): KVStorage {
  const storage = createPersistentStorage();
  return {
    getItem: (key) => Promise.resolve(storage.getItem(key)),
    setItem: (key, value) => Promise.resolve(storage.setItem(key, value)).then(() => undefined),
  };
}

let store: ReturnType<typeof createReviewsStore> | null = null;

/** One instance per app run so the device id is resolved once. */
export function getReviewsStore() {
  store ??= createReviewsStore(appKVStorage());
  return store;
}
