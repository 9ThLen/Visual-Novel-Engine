import { createSnapshotsSlice } from '@/stores/app-store-slices/snapshots-slice';
import { initialAppState } from '@/stores/app-store-initial-state';
import { createSnapshot, MAX_SNAPSHOTS_PER_STORY } from '@/lib/story-snapshots';
import type { AppStore } from '@/stores/app-store-types';
import type { SceneRecordStorageLike } from '@/lib/scene-record-storage';
import type { SceneRecord } from '@/lib/engine/types';

function scene(id: string): SceneRecord {
  return {
    id, storyId: 'story-1', name: id, description: '', tags: [], timeline: [],
    sceneState: { backgroundAssetId: null, backgroundTransition: 'fade', characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: {}, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null },
    flowX: 0, flowY: 0, connections: [], isStart: id === 'scene-1', createdAt: 1, updatedAt: 1,
  };
}

function setup() {
  const values = new Map<string, string>();
  const storage: SceneRecordStorageLike = {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => { values.set(key, value); }),
    removeItem: vi.fn((key) => { values.delete(key); }),
  };
  let state = {
    ...initialAppState,
    storiesMetadata: [{ id: 'story-1', title: 'Current', startSceneId: 'scene-x', sceneOrder: ['scene-x'], tags: ['current'], createdAt: 1, updatedAt: 1, sceneCount: 1 }],
    sceneRecordsByStory: { 'story-1': { 'scene-x': scene('scene-x') } },
    sceneRecordHydration: { 'story-1': 'full' as const },
  } as unknown as AppStore;
  const set = (partial: Parameters<Parameters<typeof createSnapshotsSlice>[0]>[0]) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };
  const get = () => state;
  const slice = createSnapshotsSlice(set, get, storage);
  state = { ...state, ...slice, hydrateSceneRecordsForStory: vi.fn(), getScenesForStory: () => Object.values(state.sceneRecordsByStory['story-1'] ?? {}) };
  return { storage, get, slice };
}

describe('snapshot slice restore', () => {
  it('restores metadata and falls back from a dangling start scene', async () => {
    const { storage, get, slice } = setup();
    await createSnapshot(storage, 'story-1', 'target', [scene('scene-1'), scene('scene-2')], {
      id: 'target', now: 1,
      story: { title: 'Saved', startSceneId: 'missing', sceneOrder: ['scene-2', 'scene-1'], tags: ['saved'] },
    });
    await expect(slice.restoreStorySnapshot('story-1', 'target')).resolves.toBe(true);
    expect(get().storiesMetadata[0]).toMatchObject({ title: 'Saved', startSceneId: 'scene-2', sceneOrder: ['scene-2', 'scene-1'], tags: ['saved'] });
  });

  it('reads the target before a cap-full automatic snapshot can evict it', async () => {
    const { storage, get, slice } = setup();
    await createSnapshot(storage, 'story-1', 'target', [scene('scene-1')], { id: 'target', now: 1, automatic: true });
    for (let index = 1; index < MAX_SNAPSHOTS_PER_STORY; index += 1) {
      await createSnapshot(storage, 'story-1', `manual-${index}`, [scene('scene-1')], { id: `manual-${index}`, now: index + 1 });
    }
    await expect(slice.restoreStorySnapshot('story-1', 'target')).resolves.toBe(true);
    expect(Object.keys(get().sceneRecordsByStory['story-1'])).toEqual(['scene-1']);
  });
});
