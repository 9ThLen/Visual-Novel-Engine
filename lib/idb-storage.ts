type StorageLike = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

const DATABASE_NAME = 'vne-storage';
const DATABASE_VERSION = 2;
const KV_STORE_NAME = 'kv';
const MEDIA_STORE_NAME = 'media';
const PENDING_IMAGES_STORE_NAME = 'pending-images';
const APP_STORAGE_PREFIX = 'vne_';
const LOCAL_STORAGE_MIGRATION_KEY = '__vne_local_storage_migration__';
const LOCAL_STORAGE_MIGRATION_VERSION = 1;

export const IDB_MEDIA_URI_PREFIX = 'idb://media/';

const databasePromises = new WeakMap<IDBFactory, Promise<IDBDatabase | null>>();

type MediaBlobStorageTestAdapter = Partial<{
  get: (storageKey: string) => Promise<Blob | null>;
  has: (storageKey: string) => Promise<boolean>;
  put: (storageKey: string, blob: Blob) => Promise<void>;
  delete: (storageKey: string) => Promise<void>;
}>;

type PendingImageStorageTestAdapter = Partial<{
  get: (requestId: string) => Promise<unknown | null>;
  put: (requestId: string, value: unknown) => Promise<void>;
  delete: (requestId: string) => Promise<void>;
  list: () => Promise<unknown[]>;
}>;

let mediaBlobStorageTestAdapter: MediaBlobStorageTestAdapter | null = null;
let pendingImageStorageTestAdapter: PendingImageStorageTestAdapter | null = null;

/** Test seam for jsdom, which does not provide IndexedDB. */
export function setMediaBlobStorageAdapterForTests(adapter: MediaBlobStorageTestAdapter | null): void {
  mediaBlobStorageTestAdapter = adapter;
}

/** Test seam for the AI pending-image repository in jsdom. */
export function setPendingImageStorageAdapterForTests(adapter: PendingImageStorageTestAdapter | null): void {
  pendingImageStorageTestAdapter = adapter;
}

export function collectLocalStorageMigrationEntries(storage: Storage | null): [string, string][] {
  if (!storage) return [];

  const entries: [string, string][] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(APP_STORAGE_PREFIX)) continue;
    const value = storage.getItem(key);
    if (value !== null) entries.push([key, value]);
  }
  return entries;
}

function migrateLocalStorage(db: IDBDatabase, entries: [string, string][]): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(KV_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(KV_STORE_NAME);
    let settled = false;

    const rejectOnce = () => {
      if (settled) return;
      settled = true;
      reject(transaction.error ?? new Error('IndexedDB migration failed'));
    };

    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    transaction.onerror = rejectOnce;
    transaction.onabort = rejectOnce;

    const markerRequest = store.get(LOCAL_STORAGE_MIGRATION_KEY);
    markerRequest.onsuccess = () => {
      if (markerRequest.result === LOCAL_STORAGE_MIGRATION_VERSION) return;

      const keysRequest = store.getAllKeys();
      keysRequest.onsuccess = () => {
        const existingKeys = new Set(keysRequest.result.map(String));
        for (const [key, value] of entries) {
          if (!existingKeys.has(key)) store.put(value, key);
        }
        store.put(LOCAL_STORAGE_MIGRATION_VERSION, LOCAL_STORAGE_MIGRATION_KEY);
      };
    };
  });
}

function openDatabase(factory: IDBFactory, sourceStorage: Storage | null): Promise<IDBDatabase> {
  const migrationEntries = collectLocalStorageMigrationEntries(sourceStorage);

  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error('IndexedDB is unavailable'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KV_STORE_NAME)) db.createObjectStore(KV_STORE_NAME);
      if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) db.createObjectStore(MEDIA_STORE_NAME);
      if (!db.objectStoreNames.contains(PENDING_IMAGES_STORE_NAME)) db.createObjectStore(PENDING_IMAGES_STORE_NAME);
    };
    request.onerror = () => rejectOnce(request.error);
    request.onblocked = () => rejectOnce(new Error('IndexedDB open was blocked'));
    request.onsuccess = async () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        databasePromises.delete(factory);
      };
      try {
        await migrateLocalStorage(db, migrationEntries);
        settled = true;
        resolve(db);
      } catch (error) {
        db.close();
        rejectOnce(error);
      }
    };
  });
}

function getDatabase(factory: IDBFactory, sourceStorage: Storage | null): Promise<IDBDatabase | null> {
  let databasePromise = databasePromises.get(factory);
  if (!databasePromise) {
    databasePromise = Promise.resolve().then(() => openDatabase(factory, sourceStorage)).catch((error) => {
      if (__DEV__) console.warn('[Storage] IndexedDB unavailable; using localStorage:', error);
      return null;
    });
    databasePromises.set(factory, databasePromise);
  }
  return databasePromise;
}

function readValue(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(KV_STORE_NAME, 'readonly');
    const request = transaction.objectStore(KV_STORE_NAME).get(key);
    let value: string | null = null;

    request.onsuccess = () => {
      value = typeof request.result === 'string' ? request.result : null;
    };
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB read aborted'));
  });
}

function writeValue(db: IDBDatabase, key: string, value?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(KV_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(KV_STORE_NAME);
    if (value === undefined) store.delete(key);
    else store.put(value, key);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
  });
}

export function createIndexedDbStorage(
  factory: IDBFactory,
  sourceStorage: Storage | null,
  fallback: StorageLike,
): StorageLike {
  const dbReady = getDatabase(factory, sourceStorage);

  return {
    getItem: async (key) => {
      const db = await dbReady;
      return db ? readValue(db, key) : fallback.getItem(key);
    },
    setItem: async (key, value) => {
      const db = await dbReady;
      if (db) await writeValue(db, key, value);
      else await fallback.setItem(key, value);
    },
    removeItem: async (key) => {
      const db = await dbReady;
      if (db) await writeValue(db, key);
      else await fallback.removeItem(key);
    },
  };
}

function getBrowserDatabase(): Promise<IDBDatabase> {
  let factory: IDBFactory | undefined;
  let sourceStorage: Storage | null = null;
  try {
    factory = typeof indexedDB === 'undefined' ? undefined : indexedDB;
    sourceStorage = typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    sourceStorage = null;
  }
  if (!factory) return Promise.reject(new Error('IndexedDB media storage is unavailable'));

  return getDatabase(factory, sourceStorage).then((db) => {
    if (!db) throw new Error('IndexedDB media storage is unavailable');
    return db;
  });
}

export function createMediaBlobUri(storageKey: string): string {
  return `${IDB_MEDIA_URI_PREFIX}${encodeURIComponent(storageKey)}`;
}

export function getMediaBlobStorageKey(uri: string): string | null {
  if (!uri.startsWith(IDB_MEDIA_URI_PREFIX)) return null;
  try {
    const storageKey = decodeURIComponent(uri.slice(IDB_MEDIA_URI_PREFIX.length));
    return storageKey && !storageKey.includes('/') && !storageKey.includes('..') ? storageKey : null;
  } catch {
    return null;
  }
}

export async function getMediaBlob(storageKey: string): Promise<Blob | null> {
  if (mediaBlobStorageTestAdapter?.get) return mediaBlobStorageTestAdapter.get(storageKey);
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
    const request = transaction.objectStore(MEDIA_STORE_NAME).get(storageKey);
    let blob: Blob | null = null;

    request.onsuccess = () => {
      blob = request.result instanceof Blob ? request.result : null;
    };
    transaction.oncomplete = () => resolve(blob);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB media read aborted'));
  });
}

export async function hasMediaBlob(storageKey: string): Promise<boolean> {
  if (mediaBlobStorageTestAdapter?.has) return mediaBlobStorageTestAdapter.has(storageKey);
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
    const request = transaction.objectStore(MEDIA_STORE_NAME).count(storageKey);
    let exists = false;

    request.onsuccess = () => {
      exists = request.result > 0;
    };
    transaction.oncomplete = () => resolve(exists);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB media check aborted'));
  });
}

export async function putMediaBlob(storageKey: string, blob: Blob): Promise<void> {
  if (mediaBlobStorageTestAdapter?.put) return mediaBlobStorageTestAdapter.put(storageKey, blob);
  if (!storageKey || blob.size <= 0) throw new Error('Cannot persist an empty media Blob');
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
    transaction.objectStore(MEDIA_STORE_NAME).put(blob, storageKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB media write failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB media write aborted'));
  });
}

export async function deleteMediaBlob(storageKey: string): Promise<void> {
  if (mediaBlobStorageTestAdapter?.delete) return mediaBlobStorageTestAdapter.delete(storageKey);
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
    transaction.objectStore(MEDIA_STORE_NAME).delete(storageKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB media delete failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB media delete aborted'));
  });
}

export async function listMediaBlobKeys(): Promise<string[]> {
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
    const request = transaction.objectStore(MEDIA_STORE_NAME).getAllKeys();
    let keys: string[] = [];

    request.onsuccess = () => {
      keys = request.result.map(String);
    };
    transaction.oncomplete = () => resolve(keys);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB media listing aborted'));
  });
}

export async function getPendingImageRecord<T>(requestId: string): Promise<T | null> {
  if (pendingImageStorageTestAdapter?.get) {
    return await pendingImageStorageTestAdapter.get(requestId) as T | null;
  }
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PENDING_IMAGES_STORE_NAME, 'readonly');
    const request = transaction.objectStore(PENDING_IMAGES_STORE_NAME).get(requestId);
    let value: T | null = null;
    request.onsuccess = () => {
      value = request.result == null ? null : request.result as T;
    };
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB pending-image read aborted'));
  });
}

export async function putPendingImageRecord(requestId: string, value: unknown): Promise<void> {
  if (pendingImageStorageTestAdapter?.put) return pendingImageStorageTestAdapter.put(requestId, value);
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PENDING_IMAGES_STORE_NAME, 'readwrite');
    transaction.objectStore(PENDING_IMAGES_STORE_NAME).put(value, requestId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB pending-image write failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB pending-image write aborted'));
  });
}

export async function deletePendingImageRecord(requestId: string): Promise<void> {
  if (pendingImageStorageTestAdapter?.delete) return pendingImageStorageTestAdapter.delete(requestId);
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PENDING_IMAGES_STORE_NAME, 'readwrite');
    transaction.objectStore(PENDING_IMAGES_STORE_NAME).delete(requestId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB pending-image delete failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB pending-image delete aborted'));
  });
}

export async function listPendingImageRecords<T>(): Promise<T[]> {
  if (pendingImageStorageTestAdapter?.list) {
    return await pendingImageStorageTestAdapter.list() as T[];
  }
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PENDING_IMAGES_STORE_NAME, 'readonly');
    const request = transaction.objectStore(PENDING_IMAGES_STORE_NAME).getAll();
    let values: T[] = [];
    request.onsuccess = () => {
      values = request.result as T[];
    };
    transaction.oncomplete = () => resolve(values);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB pending-image listing aborted'));
  });
}

/** Includes separately persisted canonical scenes and snapshots, not only app-state. */
export async function listPersistedIndexedDbValues(): Promise<string[]> {
  const db = await getBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(KV_STORE_NAME, 'readonly');
    const request = transaction.objectStore(KV_STORE_NAME).getAll();
    let values: string[] = [];

    request.onsuccess = () => {
      values = request.result.filter((value): value is string => typeof value === 'string');
    };
    transaction.oncomplete = () => resolve(values);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB value listing aborted'));
  });
}
