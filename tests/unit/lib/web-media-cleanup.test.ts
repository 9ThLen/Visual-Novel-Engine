import {
  cleanupOrphanedWebMedia,
  collectReferencedMediaKeys,
} from '@/lib/web-media-cleanup';

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe('web media orphan cleanup', () => {
  it('collects references from hydrated objects and serialized canonical scenes', () => {
    const keys = collectReferencedMediaKeys([
      { thumbnailUri: 'idb://media/thumbnail' },
      JSON.stringify({ timeline: [{ backgroundUri: 'idb://media/scene%20background' }] }),
    ]);

    expect([...keys]).toEqual(['thumbnail', 'scene background']);
  });

  it('marks an orphan first and deletes it only after the grace period', async () => {
    const storage = createMemoryStorage();
    const deleteMedia = vi.fn(async () => {});
    const dependencies = {
      storage,
      listMediaKeys: async () => ['used', 'orphan'],
      listPersistedValues: async () => [JSON.stringify({ uri: 'idb://media/used' })],
      deleteMedia,
      now: () => 1_000,
    };

    const first = await cleanupOrphanedWebMedia({}, 500, dependencies);
    const second = await cleanupOrphanedWebMedia({}, 500, {
      ...dependencies,
      now: () => 1_499,
    });
    const third = await cleanupOrphanedWebMedia({}, 500, {
      ...dependencies,
      now: () => 1_500,
    });

    expect(first.markedKeys).toEqual(['orphan']);
    expect(second.deletedKeys).toEqual([]);
    expect(third.deletedKeys).toEqual(['orphan']);
    expect(deleteMedia).toHaveBeenCalledOnce();
  });

  it('unmarks a candidate that becomes referenced before deletion', async () => {
    const storage = createMemoryStorage();
    const deleteMedia = vi.fn(async () => {});
    const base = {
      storage,
      listMediaKeys: async () => ['media'],
      deleteMedia,
      now: () => 10,
    };

    await cleanupOrphanedWebMedia({}, 1, { ...base, listPersistedValues: async () => [] });
    await cleanupOrphanedWebMedia({ uri: 'idb://media/media' }, 1, {
      ...base,
      listPersistedValues: async () => [],
      now: () => 20,
    });
    const result = await cleanupOrphanedWebMedia({}, 1, {
      ...base,
      listPersistedValues: async () => [],
      now: () => 30,
    });

    expect(result.markedKeys).toEqual(['media']);
    expect(deleteMedia).not.toHaveBeenCalled();
  });
});
