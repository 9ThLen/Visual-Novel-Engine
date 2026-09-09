import { buildPersistedAppState, mergePersistedAppState, type AppStorePersistenceState } from '@/lib/app-store-persistence';
import { createAppStoreStorage } from '@/lib/app-store-storage';
import { loadSceneRecordsForStory, type SceneRecordStorageLike } from '@/lib/scene-record-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import type { SceneRecord } from '@/lib/engine/types';
import { initialAppState } from '@/stores/app-store-initial-state';
import { createSceneSlice } from '@/stores/app-store-slices/scene-slice';
import type { AppStore } from '@/stores/app-store-types';

function scene(id: string, isStart = false): SceneRecord {
  return {
    id, storyId: 'story-1', name: id, description: '', tags: [], timeline: [],
    sceneState: { backgroundAssetId: null, backgroundTransition: 'fade', characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: {}, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null },
    flowX: 0, flowY: 0, connections: [], isStart, createdAt: 1, updatedAt: 1,
  };
}

describe('AI change-set persistence', () => {
  it('reloads mutually consistent scenes, order, count, and characters after commit', async () => {
    let state = {
      ...initialAppState,
      storiesMetadata: [{ id: 'story-1', title: 'Story', startSceneId: 'scene-1', sceneOrder: ['scene-1'], createdAt: 1, updatedAt: 1, sceneCount: 1 }],
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene('scene-1', true) } },
      sceneRecordHydration: { 'story-1': 'full' as const },
    } as unknown as AppStore;
    const set = (partial: Parameters<Parameters<typeof createSceneSlice>[0]>[0]) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      state = { ...state, ...next };
    };
    const slice = createSceneSlice(set, () => state);
    state = { ...state, ...slice };
    const created = scene('scene-2');
    const character = { id: 'character-1', name: 'Nova', sprites: [], createdAt: 2 };

    slice.commitAiChangeSet('story-1', {
      ok: true,
      scenesToSave: [created],
      sceneIdsCreated: ['scene-2'],
      nextSceneOrder: ['scene-1', 'scene-2'],
      charactersToSave: [character],
      connectionsToSet: [],
    });

    const values = new Map<string, string>();
    const raw: SceneRecordStorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    };
    const storage = createAppStoreStorage(raw);
    await storage.setItem(STORAGE_KEYS.APP_STATE, JSON.stringify({ state: buildPersistedAppState(state), version: 4 }));
    const envelope = JSON.parse((await storage.getItem(STORAGE_KEYS.APP_STATE))!);
    const reloadedMetadata = mergePersistedAppState(envelope.state, initialAppState as AppStorePersistenceState);
    const reloadedScenes = await loadSceneRecordsForStory(raw, 'story-1');

    expect(Object.keys(reloadedScenes)).toEqual(['scene-1', 'scene-2']);
    expect(reloadedMetadata.storiesMetadata[0]).toMatchObject({ sceneOrder: ['scene-1', 'scene-2'], sceneCount: 2 });
    expect(reloadedMetadata.characterLibraries['story-1']).toEqual([
      expect.objectContaining({ id: character.id, name: character.name, sprites: [], createdAt: 2 }),
    ]);
  });
});
