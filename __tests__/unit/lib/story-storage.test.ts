/**
 * Forgetting a story.
 *
 * Scenes and snapshots are written by different modules, and before this they
 * were cleaned up by different rules — scenes by a persist that inferred
 * deletion from absence, snapshots by nothing at all. These tests hold the two
 * halves together: whatever removes one has to remove the other.
 */
import type { SceneRecord } from '@/lib/engine/types';
import { buildSceneRecordItemIndex, type SceneRecordStorageLike } from '@/lib/scene-record-storage';
import { forgetStoryStorage } from '@/lib/story-storage';
import { createSnapshot } from '@/lib/story-snapshots';

const STORY_ID = 'story-1';

function scene(id: string, storyId = STORY_ID): SceneRecord {
  return {
    id,
    storyId,
    name: id,
    description: '',
    tags: [],
    timeline: [],
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function createMemoryStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues));
  const storage: SceneRecordStorageLike = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  return { storage, values };
}

/** A story as it sits on disk: index, bundle, item index and one item body. */
async function storedStory(storyId: string) {
  const { storage, values } = createMemoryStorage({
    vne_scene_record_index: JSON.stringify({ version: 1, storyIds: [storyId, 'other-story'] }),
    [`vne_scene_records_${storyId}`]: JSON.stringify({
      version: 1,
      storyId,
      records: { 'scene-1': scene('scene-1', storyId) },
      updatedAt: 1,
    }),
    [`vne_scene_record_ids_${storyId}`]: JSON.stringify(
      buildSceneRecordItemIndex(storyId, { 'scene-1': scene('scene-1', storyId) }, 1),
    ),
    [`vne_scene_record_${storyId}_scene-1`]: JSON.stringify({
      version: 1,
      storyId,
      sceneId: 'scene-1',
      record: scene('scene-1', storyId),
      updatedAt: 1,
    }),
  });
  await createSnapshot(storage, storyId, 'before the rewrite', [scene('scene-1', storyId)], {
    id: 'snap-a',
    now: 1,
  });
  return { storage, values };
}

describe('forgetStoryStorage', () => {
  it('removes the scenes and the snapshots together', async () => {
    const { storage, values } = await storedStory(STORY_ID);

    await forgetStoryStorage(storage, STORY_ID);

    const left = [...values.keys()].filter((key) => key.includes(STORY_ID));
    expect(left).toEqual([]);
  });

  it('takes the story out of the scene index', async () => {
    const { storage, values } = await storedStory(STORY_ID);

    await forgetStoryStorage(storage, STORY_ID);

    expect(JSON.parse(values.get('vne_scene_record_index') ?? '{}').storyIds)
      .toEqual(['other-story']);
  });

  it('does nothing without a story id', async () => {
    const { storage, values } = await storedStory(STORY_ID);
    const before = values.size;

    await forgetStoryStorage(storage, '');

    expect(values.size).toBe(before);
  });

  // Half a cleanup beats none: what is left behind is unreachable, not harmful,
  // and the caller still learns that something went wrong.
  it('still removes the snapshots when the scene records cannot be read', async () => {
    const { storage, values } = await storedStory(STORY_ID);
    (storage.getItem as unknown as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'vne_scene_record_index') throw new Error('storage unavailable');
      return values.get(key) ?? null;
    });

    await expect(forgetStoryStorage(storage, STORY_ID)).rejects.toThrow('storage unavailable');

    expect([...values.keys()].some((key) => key.startsWith('vne_story_snapshot'))).toBe(false);
  });
});
