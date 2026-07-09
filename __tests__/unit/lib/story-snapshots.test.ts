import type { SceneRecord } from '@/lib/engine/types';
import type { SceneRecordStorageLike } from '@/lib/scene-record-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
  MAX_SNAPSHOTS_PER_STORY,
} from '@/lib/story-snapshots';

const STORY_ID = 'story-1';

function scene(id: string, storyId = STORY_ID, text = ''): SceneRecord {
  return {
    id,
    storyId,
    name: id,
    description: '',
    tags: [],
    timeline: text
      ? [
          {
            id: `${id}-step`,
            blockType: 'text',
            data: { content: text },
          } as SceneRecord['timeline'][number],
        ]
      : [],
    sceneState: {
      backgroundAssetId: null,
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      musicTrackId: null,
      musicPlaying: false,
      musicVolume: 1,
      variables: {},
      dialogueHistory: [],
      currentChoices: null,
      isTransitioning: false,
      transitionTarget: null,
    },
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: id === 'scene-1',
    createdAt: 1,
    updatedAt: 1,
  };
}

function createMemoryStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues));
  const storage: SceneRecordStorageLike = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
  return { storage, values };
}

describe('story snapshots', () => {
  it('roundtrips scene records through create → list → restore', async () => {
    const { storage } = createMemoryStorage();
    const scenes = [scene('scene-1', STORY_ID, 'hello world'), scene('scene-2', STORY_ID, 'two words here')];

    const meta = await createSnapshot(storage, STORY_ID, 'draft-1', scenes, {
      now: 1000,
      id: 'snap-a',
    });

    expect(meta).toMatchObject({
      id: 'snap-a',
      name: 'draft-1',
      createdAt: 1000,
      sceneCount: 2,
      automatic: false,
    });
    // "hello world" (2) + "two words here" (3) = 5 words.
    expect(meta.words).toBe(5);

    const list = await listSnapshots(storage, STORY_ID);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(meta);

    const restored = await restoreSnapshot(storage, STORY_ID, 'snap-a');
    expect(restored).toEqual(scenes);
  });

  it('lists snapshots newest-first without reading any body keys', async () => {
    const { storage } = createMemoryStorage();
    await createSnapshot(storage, STORY_ID, 'first', [scene('scene-1')], { now: 1, id: 'a' });
    await createSnapshot(storage, STORY_ID, 'second', [scene('scene-1')], { now: 2, id: 'b' });

    const getItem = storage.getItem as ReturnType<typeof vi.fn>;
    getItem.mockClear();

    const list = await listSnapshots(storage, STORY_ID);

    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
    // Only the index key was read — no manifests, no scene bodies.
    const readKeys = getItem.mock.calls.map((call) => call[0] as string);
    expect(readKeys).toEqual([STORAGE_KEYS.STORY_SNAPSHOT_INDEX(STORY_ID)]);
    expect(readKeys.some((key) => key.includes('story_snapshot_scene'))).toBe(false);
    expect(
      readKeys.some(
        (key) =>
          key.startsWith('vne_story_snapshot_') &&
          !key.startsWith(STORAGE_KEYS.STORY_SNAPSHOT_INDEX(STORY_ID)),
      ),
    ).toBe(false);
  });

  it('evicts the oldest automatic snapshot when over the cap, keeping named ones', async () => {
    const { storage } = createMemoryStorage();

    // Fill to the cap with a mix; the very oldest is named, the rest automatic.
    await createSnapshot(storage, STORY_ID, 'named-oldest', [scene('scene-1')], {
      now: 0,
      id: 'named-0',
    });
    for (let i = 1; i < MAX_SNAPSHOTS_PER_STORY; i += 1) {
      await createSnapshot(storage, STORY_ID, `auto-${i}`, [scene('scene-1')], {
        now: i,
        id: `auto-${i}`,
        automatic: true,
      });
    }

    let list = await listSnapshots(storage, STORY_ID);
    expect(list).toHaveLength(MAX_SNAPSHOTS_PER_STORY);

    // The 11th snapshot must evict the oldest AUTOMATIC one (auto-1), not the
    // older named snapshot (named-0).
    await createSnapshot(storage, STORY_ID, 'eleventh', [scene('scene-1')], {
      now: 100,
      id: 'eleventh',
    });

    list = await listSnapshots(storage, STORY_ID);
    const ids = list.map((s) => s.id);
    expect(list).toHaveLength(MAX_SNAPSHOTS_PER_STORY);
    expect(ids).toContain('named-0'); // named survivor
    expect(ids).toContain('eleventh'); // newcomer
    expect(ids).not.toContain('auto-1'); // oldest automatic evicted

    // Evicted snapshot's bodies are gone too.
    await expect(restoreSnapshot(storage, STORY_ID, 'auto-1')).rejects.toThrow();
  });

  it('evicts the oldest named snapshot only when none are automatic', async () => {
    const { storage } = createMemoryStorage();
    for (let i = 0; i < MAX_SNAPSHOTS_PER_STORY; i += 1) {
      await createSnapshot(storage, STORY_ID, `named-${i}`, [scene('scene-1')], {
        now: i,
        id: `named-${i}`,
      });
    }

    await createSnapshot(storage, STORY_ID, 'newest', [scene('scene-1')], {
      now: 100,
      id: 'newest',
    });

    const ids = (await listSnapshots(storage, STORY_ID)).map((s) => s.id);
    expect(ids).not.toContain('named-0'); // oldest named evicted
    expect(ids).toContain('named-1');
    expect(ids).toContain('newest');
  });

  it('restore fails and leaves storage untouched if a scene body is missing', async () => {
    const { storage, values } = createMemoryStorage();
    const scenes = [scene('scene-1'), scene('scene-2')];
    await createSnapshot(storage, STORY_ID, 'draft', scenes, { now: 1, id: 'snap-x' });

    // Corrupt the snapshot by dropping one scene body mid-set.
    values.delete(STORAGE_KEYS.STORY_SNAPSHOT_SCENE(STORY_ID, 'snap-x', 'scene-2'));

    const setItem = storage.setItem as ReturnType<typeof vi.fn>;
    const removeItem = storage.removeItem as ReturnType<typeof vi.fn>;
    setItem.mockClear();
    removeItem.mockClear();

    await expect(restoreSnapshot(storage, STORY_ID, 'snap-x')).rejects.toThrow();

    // A failed restore is a pure read: it never writes or deletes anything.
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    // The index and remaining bodies are intact.
    expect(await listSnapshots(storage, STORY_ID)).toHaveLength(1);
    expect(values.has(STORAGE_KEYS.STORY_SNAPSHOT_SCENE(STORY_ID, 'snap-x', 'scene-1'))).toBe(true);
  });

  it('restore throws for an unknown snapshot', async () => {
    const { storage } = createMemoryStorage();
    await expect(restoreSnapshot(storage, STORY_ID, 'missing')).rejects.toThrow();
  });

  it('deletes a snapshot and its bodies', async () => {
    const { storage, values } = createMemoryStorage();
    await createSnapshot(storage, STORY_ID, 'a', [scene('scene-1'), scene('scene-2')], {
      now: 1,
      id: 'snap-del',
    });

    await deleteSnapshot(storage, STORY_ID, 'snap-del');

    expect(await listSnapshots(storage, STORY_ID)).toHaveLength(0);
    expect(values.has(STORAGE_KEYS.STORY_SNAPSHOT_MANIFEST(STORY_ID, 'snap-del'))).toBe(false);
    expect(values.has(STORAGE_KEYS.STORY_SNAPSHOT_SCENE(STORY_ID, 'snap-del', 'scene-1'))).toBe(false);
    expect(values.has(STORAGE_KEYS.STORY_SNAPSHOT_SCENE(STORY_ID, 'snap-del', 'scene-2'))).toBe(false);
  });

  it('keeps snapshots isolated per story', async () => {
    const { storage } = createMemoryStorage();
    await createSnapshot(storage, 'story-a', 'a', [scene('scene-1', 'story-a')], { now: 1, id: 's1' });
    await createSnapshot(storage, 'story-b', 'b', [scene('scene-1', 'story-b')], { now: 1, id: 's2' });

    expect((await listSnapshots(storage, 'story-a')).map((s) => s.id)).toEqual(['s1']);
    expect((await listSnapshots(storage, 'story-b')).map((s) => s.id)).toEqual(['s2']);
  });
});
