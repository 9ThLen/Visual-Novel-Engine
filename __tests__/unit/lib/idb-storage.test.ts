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
});
