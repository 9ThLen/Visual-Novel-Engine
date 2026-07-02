import { createAppStoreStorage } from '@/lib/app-store-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import type { SceneRecord } from '@/lib/engine/types';

function createMemoryStorage() {
  const values = new Map<string, string>();
  const state = { failSceneRecordWrites: false };
  const memoryStorage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      if (state.failSceneRecordWrites && key.startsWith('vne_scene_records_')) {
        throw new Error('scene write failed');
      }
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
  return { values, memoryStorage, state };
}

function scene(id: string, storyId = 'story-1'): SceneRecord {
  return {
    id,
    storyId,
    name: id,
    description: '',
    tags: [],
    timeline: [],
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

function appEnvelope() {
  return JSON.stringify({
    state: {
      storiesMetadata: [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 1,
        },
      ],
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': scene('scene-1'),
        },
      },
    },
    version: 1,
  });
}

function metadataOnlyEnvelope() {
  return JSON.stringify({
    state: {
      storiesMetadata: [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 1,
        },
      ],
      sceneRecordsByStory: {},
    },
    version: 2,
  });
}

function readerWindowEnvelope() {
  return JSON.stringify({
    state: {
      storiesMetadata: [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 2,
        },
      ],
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': scene('scene-1'),
        },
      },
      sceneRecordHydration: {
        'story-1': 'window',
      },
    },
    version: 2,
  });
}

describe('app store storage', () => {
  it('migrates legacy sceneRecordsByStory to per-story storage on read', async () => {
    const storageMock = createMemoryStorage();
    storageMock.values.set(STORAGE_KEYS.APP_STATE, appEnvelope());
    const storage = createAppStoreStorage(storageMock.memoryStorage);

    const raw = await storage.getItem(STORAGE_KEYS.APP_STATE);
    const appState = JSON.parse(raw ?? '{}');
    const scenePayload = JSON.parse(storageMock.values.get('vne_scene_records_story-1') ?? '{}');

    expect(appState.state.sceneRecordsByStory).toEqual({});
    expect(scenePayload.records['scene-1']).toMatchObject({ id: 'scene-1', storyId: 'story-1' });
  });

  it('compacts app state scenes on write after per-story scene persistence succeeds', async () => {
    const storageMock = createMemoryStorage();
    const storage = createAppStoreStorage(storageMock.memoryStorage);

    await storage.setItem(STORAGE_KEYS.APP_STATE, appEnvelope());

    const appState = JSON.parse(storageMock.values.get(STORAGE_KEYS.APP_STATE) ?? '{}');
    expect(appState.state.sceneRecordsByStory).toEqual({});
    expect(storageMock.values.has('vne_scene_records_story-1')).toBe(true);
  });

  it('keeps the full app state fallback if per-story scene persistence fails', async () => {
    const storageMock = createMemoryStorage();
    storageMock.state.failSceneRecordWrites = true;
    const storage = createAppStoreStorage(storageMock.memoryStorage);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await storage.setItem(STORAGE_KEYS.APP_STATE, appEnvelope());

    const appState = JSON.parse(storageMock.values.get(STORAGE_KEYS.APP_STATE) ?? '{}');
    expect(appState.state.sceneRecordsByStory['story-1']['scene-1']).toMatchObject({
      id: 'scene-1',
    });
    warnSpy.mockRestore();
  });

  it('updates the scene index and removes stale story keys even when no scenes are loaded', async () => {
    const storageMock = createMemoryStorage();
    storageMock.values.set('vne_scene_record_index', JSON.stringify({
      version: 1,
      storyIds: ['story-1', 'story-2'],
    }));
    storageMock.values.set('vne_scene_records_story-2', JSON.stringify({
      version: 1,
      storyId: 'story-2',
      records: {
        'scene-2': scene('scene-2', 'story-2'),
      },
      updatedAt: 1,
    }));
    const storage = createAppStoreStorage(storageMock.memoryStorage);

    await storage.setItem(STORAGE_KEYS.APP_STATE, metadataOnlyEnvelope());

    const index = JSON.parse(storageMock.values.get('vne_scene_record_index') ?? '{}');
    expect(index.storyIds).toEqual(['story-1']);
    expect(storageMock.values.has('vne_scene_records_story-2')).toBe(false);
  });

  it('does not overwrite full scene storage with a bounded reader window', async () => {
    const storageMock = createMemoryStorage();
    storageMock.values.set('vne_scene_records_story-1', JSON.stringify({
      version: 1,
      storyId: 'story-1',
      records: {
        'scene-1': scene('scene-1'),
        'scene-2': scene('scene-2'),
      },
      updatedAt: 1,
    }));
    const storage = createAppStoreStorage(storageMock.memoryStorage);

    await storage.setItem(STORAGE_KEYS.APP_STATE, readerWindowEnvelope());

    const scenePayload = JSON.parse(storageMock.values.get('vne_scene_records_story-1') ?? '{}');
    const appState = JSON.parse(storageMock.values.get(STORAGE_KEYS.APP_STATE) ?? '{}');
    expect(Object.keys(scenePayload.records)).toEqual(['scene-1', 'scene-2']);
    expect(appState.state.sceneRecordsByStory).toEqual({});
    expect(appState.state.sceneRecordHydration).toEqual({});
  });
});
