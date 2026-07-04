import type { SceneRecord } from '@/lib/engine/types';
import {
  buildSceneRecordStorageEntries,
  buildSceneRecordItemIndex,
  buildSceneRecordItemPayload,
  buildSceneRecordStorageIndex,
  buildSceneRecordStoragePayload,
  getSceneRecordIdIndexStorageKey,
  getSceneRecordItemStorageKey,
  getSceneRecordStorageKey,
  loadReaderSceneRecordWindow,
  loadSceneRecordForStory,
  loadSceneRecordsByStoryFromIndex,
  loadSceneRecordsForStory,
  mergeSceneRecordStoragePayloads,
  parseSceneRecordItemIndex,
  parseSceneRecordItemPayload,
  parseSceneRecordStoragePayload,
  parseSceneRecordStorageIndex,
  persistSceneRecordsByStory,
  SCENE_RECORD_STORAGE_VERSION,
  type SceneRecordStorageLike,
} from '@/lib/scene-record-storage';

function scene(
  id: string,
  storyId = 'story-1',
  connections: SceneRecord['connections'] = [],
): SceneRecord {
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
    connections,
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

describe('scene record storage helpers', () => {
  it('builds stable per-story storage keys and an index', () => {
    const index = buildSceneRecordStorageIndex(
      [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 1,
        },
      ],
      {
        'story-2': {
          'scene-2': scene('scene-2', 'story-2'),
        },
      },
    );

    expect(getSceneRecordStorageKey('story-1')).toBe('vne_scene_records_story-1');
    expect(getSceneRecordIdIndexStorageKey('story-1')).toBe('vne_scene_record_ids_story-1');
    expect(getSceneRecordItemStorageKey('story-1', 'scene-1')).toBe(
      'vne_scene_record_story-1_scene-1',
    );
    expect(index).toEqual({
      version: SCENE_RECORD_STORAGE_VERSION,
      storyIds: ['story-1', 'story-2'],
    });
  });

  it('parses malformed indexes as empty indexes', () => {
    expect(parseSceneRecordStorageIndex('{bad')).toEqual({
      version: SCENE_RECORD_STORAGE_VERSION,
      storyIds: [],
    });
    expect(parseSceneRecordStorageIndex({ storyIds: ['story-1', 'story-1', 1] })).toEqual({
      version: SCENE_RECORD_STORAGE_VERSION,
      storyIds: ['story-1'],
    });
  });

  it('builds per-story payloads while filtering invalid or cross-story records', () => {
    const payload = buildSceneRecordStoragePayload(
      'story-1',
      {
        'scene-1': scene('scene-1'),
        'scene-2': scene('scene-2', 'story-2'),
        mismatch: scene('scene-3'),
      },
      123,
    );

    expect(payload).toEqual({
      version: SCENE_RECORD_STORAGE_VERSION,
      storyId: 'story-1',
      updatedAt: 123,
      records: {
        'scene-1': scene('scene-1'),
      },
    });
  });

  it('builds and parses per-scene item payloads and indexes', () => {
    const itemIndex = buildSceneRecordItemIndex(
      'story-1',
      {
        'scene-1': scene('scene-1'),
        'scene-2': scene('scene-2', 'story-2'),
      },
      123,
    );
    const itemPayload = buildSceneRecordItemPayload(
      'story-1',
      'scene-1',
      scene('scene-1'),
      123,
    );

    expect(itemIndex).toEqual({
      version: SCENE_RECORD_STORAGE_VERSION,
      storyId: 'story-1',
      sceneIds: ['scene-1'],
      updatedAt: 123,
    });
    expect(parseSceneRecordItemIndex(JSON.stringify(itemIndex), 'story-1')).toEqual(itemIndex);
    expect(parseSceneRecordItemPayload(JSON.stringify(itemPayload), 'story-1', 'scene-1')).toEqual(
      itemPayload,
    );
    expect(buildSceneRecordItemPayload('story-1', 'scene-2', scene('scene-1'), 123)).toBeNull();
    expect(parseSceneRecordItemPayload('{bad')).toBeNull();
  });

  it('creates storage entries for each story record map', () => {
    expect(
      buildSceneRecordStorageEntries(
        {
          'story-1': {
            'scene-1': scene('scene-1'),
          },
        },
        456,
      ),
    ).toEqual([
      {
        key: 'vne_scene_records_story-1',
        storyId: 'story-1',
        payload: {
          version: SCENE_RECORD_STORAGE_VERSION,
          storyId: 'story-1',
          updatedAt: 456,
          records: {
            'scene-1': scene('scene-1'),
          },
        },
      },
    ]);
  });

  it('parses valid payloads and ignores invalid JSON', () => {
    const payload = buildSceneRecordStoragePayload(
      'story-1',
      {
        'scene-1': scene('scene-1'),
      },
      789,
    );

    expect(parseSceneRecordStoragePayload(JSON.stringify(payload))).toEqual(payload);
    expect(parseSceneRecordStoragePayload('{bad')).toBeNull();
    expect(parseSceneRecordStoragePayload({ records: {} })).toBeNull();
  });

  it('migrates legacy audio blocks in per-story and per-scene storage payloads', () => {
    const legacyScene: SceneRecord = {
      ...scene('scene-1'),
      timeline: [
        {
          id: 'music-1',
          sceneId: 'scene-1',
          blockType: 'music',
          order: 0,
          data: { action: 'fade', fadeDuration: 400 },
        },
        {
          id: 'sound-1',
          sceneId: 'scene-1',
          blockType: 'sound',
          order: 1,
          data: { action: 'stop', assetId: 'rain' },
        },
      ] as unknown as SceneRecord['timeline'],
    };

    const parsedStoryPayload = parseSceneRecordStoragePayload({
      version: SCENE_RECORD_STORAGE_VERSION,
      storyId: 'story-1',
      records: {
        'scene-1': legacyScene,
      },
      updatedAt: 1,
    });
    const itemPayload = buildSceneRecordItemPayload('story-1', 'scene-1', legacyScene, 1);
    const parsedItemPayload = parseSceneRecordItemPayload(itemPayload, 'story-1', 'scene-1');

    expect(parsedStoryPayload?.records['scene-1'].timeline[0].data).toMatchObject({
      mode: 'silence',
      fadeIn: 0,
      fadeOut: 0.4,
    });
    expect(parsedStoryPayload?.records['scene-1'].timeline[1].data).toMatchObject({
      mode: 'silence',
      assetId: 'rain',
      loop: true,
    });
    expect(parsedItemPayload?.record.timeline[0].data).toMatchObject({
      mode: 'silence',
      fadeOut: 0.4,
    });
  });

  it('merges parsed payloads into sceneRecordsByStory shape', () => {
    const merged = mergeSceneRecordStoragePayloads([
      buildSceneRecordStoragePayload('story-1', { 'scene-1': scene('scene-1') }, 1),
      buildSceneRecordStoragePayload('story-2', { 'scene-2': scene('scene-2', 'story-2') }, 1),
      '{bad',
    ]);

    expect(Object.keys(merged)).toEqual(['story-1', 'story-2']);
    expect(merged['story-1']['scene-1'].id).toBe('scene-1');
    expect(merged['story-2']['scene-2'].storyId).toBe('story-2');
  });

  it('persists and loads scene records through per-story storage keys', async () => {
    const { storage } = createMemoryStorage();

    await persistSceneRecordsByStory(
      storage,
      [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 1,
        },
      ],
      {
        'story-1': {
          'scene-1': scene('scene-1'),
        },
      },
    );

    expect(await loadSceneRecordsForStory(storage, 'story-1')).toEqual({
      'scene-1': scene('scene-1'),
    });
    expect(await loadSceneRecordForStory(storage, 'story-1', 'scene-1')).toEqual(scene('scene-1'));
    expect(await loadSceneRecordsByStoryFromIndex(storage)).toEqual({
      'story-1': {
        'scene-1': scene('scene-1'),
      },
    });
  });

  it('loads a reader window from per-scene sidecar payloads', async () => {
    const current = scene('scene-1', 'story-1', [
      { targetSceneId: 'scene-2', outputPort: 'next' },
      { targetSceneId: 'scene-3', outputPort: 'skip' },
    ]);
    const { storage } = createMemoryStorage({
      'vne_scene_record_ids_story-1': JSON.stringify(
        buildSceneRecordItemIndex(
          'story-1',
          {
            'scene-1': current,
            'scene-2': scene('scene-2'),
            'scene-3': scene('scene-3'),
          },
          1,
        ),
      ),
      'vne_scene_record_story-1_scene-1': JSON.stringify(
        buildSceneRecordItemPayload('story-1', 'scene-1', current, 1),
      ),
      'vne_scene_record_story-1_scene-2': JSON.stringify(
        buildSceneRecordItemPayload('story-1', 'scene-2', scene('scene-2'), 1),
      ),
      'vne_scene_record_story-1_scene-3': JSON.stringify(
        buildSceneRecordItemPayload('story-1', 'scene-3', scene('scene-3'), 1),
      ),
      'vne_scene_records_story-1': JSON.stringify(
        buildSceneRecordStoragePayload(
          'story-1',
          {
            'scene-1': current,
            'scene-2': scene('scene-2'),
            'scene-3': scene('scene-3'),
          },
          1,
        ),
      ),
    });

    await expect(loadReaderSceneRecordWindow(storage, 'story-1', 'scene-1', 1)).resolves.toEqual({
      'scene-1': current,
      'scene-2': scene('scene-2'),
    });
    expect(storage.getItem).not.toHaveBeenCalledWith('vne_scene_records_story-1');
  });

  it('falls back to per-story payloads when per-scene payloads are absent', async () => {
    const current = scene('scene-1', 'story-1', [
      { targetSceneId: 'scene-2', outputPort: 'next' },
    ]);
    const { storage } = createMemoryStorage({
      'vne_scene_records_story-1': JSON.stringify(
        buildSceneRecordStoragePayload(
          'story-1',
          {
            'scene-1': current,
            'scene-2': scene('scene-2'),
          },
          1,
        ),
      ),
    });

    await expect(loadReaderSceneRecordWindow(storage, 'story-1', 'scene-1')).resolves.toEqual({
      'scene-1': current,
      'scene-2': scene('scene-2'),
    });
  });

  it('removes stale per-story scene records when the index shrinks', async () => {
    const { storage, values } = createMemoryStorage({
      vne_scene_record_index: JSON.stringify({
        version: SCENE_RECORD_STORAGE_VERSION,
        storyIds: ['story-1', 'story-2'],
      }),
      'vne_scene_record_ids_story-2': JSON.stringify(
        buildSceneRecordItemIndex(
          'story-2',
          { 'scene-2': scene('scene-2', 'story-2') },
          1,
        ),
      ),
      'vne_scene_record_story-2_scene-2': JSON.stringify(
        buildSceneRecordItemPayload('story-2', 'scene-2', scene('scene-2', 'story-2'), 1),
      ),
      'vne_scene_records_story-2': JSON.stringify(
        buildSceneRecordStoragePayload('story-2', { 'scene-2': scene('scene-2', 'story-2') }, 1),
      ),
    });

    await persistSceneRecordsByStory(
      storage,
      [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 1,
        },
      ],
      {
        'story-1': {
          'scene-1': scene('scene-1'),
        },
      },
    );

    expect(values.has('vne_scene_records_story-2')).toBe(false);
    expect(values.has('vne_scene_record_ids_story-2')).toBe(false);
    expect(values.has('vne_scene_record_story-2_scene-2')).toBe(false);
  });
});
