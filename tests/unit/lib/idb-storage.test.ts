import {
  collectLocalStorageMigrationEntries,
  createMediaBlobUri,
  createIndexedDbStorage,
  getMediaBlobStorageKey,
} from '@/lib/idb-storage';

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('IndexedDB storage', () => {
  it('round-trips safe media Blob storage keys', () => {
    const uri = createMediaBlobUri('asset key');

    expect(uri).toBe('idb://media/asset%20key');
    expect(getMediaBlobStorageKey(uri)).toBe('asset key');
    expect(getMediaBlobStorageKey('idb://media/../unsafe')).toBeNull();
  });

  it('collects every vne key without touching unrelated localStorage data', () => {
    const source = createMemoryStorage({
      unrelated: 'keep-local',
      vne_app_state: '{"state":{}}',
      vne_scene_record_story_scene: '{"id":"scene"}',
      vne_story_snapshot_scene_story_snapshot_scene: '{"timeline":[]}',
    });

    expect(collectLocalStorageMigrationEntries(source)).toEqual([
      ['vne_app_state', '{"state":{}}'],
      ['vne_scene_record_story_scene', '{"id":"scene"}'],
      ['vne_story_snapshot_scene_story_snapshot_scene', '{"timeline":[]}'],
    ]);
    expect(source.getItem('unrelated')).toBe('keep-local');
  });

  it('uses the supplied fallback when IndexedDB cannot be opened', async () => {
    const values = new Map<string, string>();
    const fallback = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
    };
    const factory = {
      open: vi.fn(() => {
        throw new Error('blocked');
      }),
    } as unknown as IDBFactory;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = createIndexedDbStorage(factory, createMemoryStorage(), fallback);

    await storage.setItem('vne_app_state', 'saved');
    await expect(storage.getItem('vne_app_state')).resolves.toBe('saved');
    await storage.removeItem('vne_app_state');

    expect(factory.open).toHaveBeenCalledOnce();
    expect(fallback.setItem).toHaveBeenCalledWith('vne_app_state', 'saved');
    expect(fallback.removeItem).toHaveBeenCalledWith('vne_app_state');
    warnSpy.mockRestore();
  });

  it('falls back when reading the localStorage migration source throws', async () => {
    const source = {
      get length(): number {
        throw new Error('denied');
      },
    } as Storage;
    const fallback = {
      getItem: vi.fn(() => 'fallback'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const factory = { open: vi.fn() } as unknown as IDBFactory;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = createIndexedDbStorage(factory, source, fallback);

    await expect(storage.getItem('vne_app_state')).resolves.toBe('fallback');
    expect(factory.open).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('opens a fresh database after the active handle receives versionchange', async () => {
    const values = new Map<string, string>([['__local_storage_migration__', '1']]);
    const databases: Array<IDBDatabase & { closed: boolean }> = [];
    const open = vi.fn(() => {
      const request = {} as IDBOpenDBRequest;
      const db = {
        closed: false,
        close: vi.fn(() => { db.closed = true; }),
        objectStoreNames: { contains: () => true },
        transaction: vi.fn((_name: string, mode: IDBTransactionMode) => {
          if (db.closed) throw new DOMException('Database is closed', 'InvalidStateError');
          const transaction = { error: null } as unknown as IDBTransaction;
          const complete = () => setTimeout(() => transaction.oncomplete?.(new Event('complete')), 0);
          const store = {
            get: (key: string) => {
              const item = { result: values.get(key) } as IDBRequest;
              setTimeout(() => {
                item.onsuccess?.(new Event('success'));
                complete();
              }, 0);
              return item;
            },
            getAllKeys: () => ({ result: [] }) as unknown as IDBRequest<IDBValidKey[]>,
            put: (value: string, key: string) => {
              values.set(key, value);
              if (mode === 'readwrite') complete();
              return {} as IDBRequest;
            },
            delete: (key: string) => {
              values.delete(key);
              complete();
              return {} as IDBRequest;
            },
          };
          Object.assign(transaction, { objectStore: () => store });
          return transaction;
        }),
      } as unknown as IDBDatabase & { closed: boolean };
      databases.push(db);
      Object.assign(request, { result: db });
      setTimeout(() => request.onsuccess?.(new Event('success')), 0);
      return request;
    });
    const storage = createIndexedDbStorage({ open } as unknown as IDBFactory, null, {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    await storage.getItem('first');
    databases[0].onversionchange?.(new Event('versionchange') as IDBVersionChangeEvent);
    await storage.getItem('second');

    expect(open).toHaveBeenCalledTimes(2);
    expect(databases[0].closed).toBe(true);
  });
});
