import { initialAppState } from '@/stores/app-store-initial-state';
import { createLibrariesSlice } from '@/stores/app-store-slices/libraries-slice';
import { createPlaybackSlice } from '@/stores/app-store-slices/playback-slice';
import { createPreferencesSlice } from '@/stores/app-store-slices/preferences-slice';
import { createSavesSlice } from '@/stores/app-store-slices/saves-slice';
import { createSceneSlice } from '@/stores/app-store-slices/scene-slice';
import { createStorySlice } from '@/stores/app-store-slices/story-slice';
import {
  buildSceneRecordItemPayload,
  buildSceneRecordStoragePayload,
} from '@/lib/scene-record-storage';
import type { SceneRecord } from '@/lib/engine/types';
import type { AppStore } from '@/stores/app-store-types';
import type { AppStoreGet, AppStoreSet } from '@/stores/app-store-slices/types';

function makeSceneRecord(
  id: string,
  storyId = 'story-1',
  connections: SceneRecord['connections'] = [],
): SceneRecord {
  return {
    id,
    storyId,
    name: `Scene ${id}`,
    description: '',
    tags: [],
    timeline: [
      {
        id: `text-${id}`,
        blockType: 'text',
        data: {
          content: `Text for ${id}`,
          typewriterSpeed: 0.5,
          anchorTo: 'background',
        },
        collapsed: false,
        enabled: true,
      },
    ],
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

function createSliceHarness() {
  let state = { ...initialAppState } as AppStore;
  const set: AppStoreSet = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };
  const get: AppStoreGet = () => state;
  return {
    get state() {
      return state;
    },
    get,
    set,
  };
}

describe('app store slices', () => {
  it('updates playback state and clears the current story when loading null', async () => {
    const harness = createSliceHarness();
    const slice = createPlaybackSlice(harness.set);

    await slice.loadCurrentStory('story-1');
    slice.updatePlaybackState({
      storyId: 'story-1',
      currentSceneId: 'scene-1',
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: [],
    });
    await slice.loadCurrentStory(null);

    expect(harness.state.currentStoryId).toBeNull();
    expect(harness.state.playbackState).toBeNull();
  });

  it('normalizes settings updates and stores language changes', () => {
    const harness = createSliceHarness();
    const slice = createPreferencesSlice(harness.set);

    slice.updateSettings({ bgmVolume: 2, textSpeed: -1 });
    slice.setLanguage('uk');

    expect(harness.state.settings.bgmVolume).toBe(1);
    expect(harness.state.settings.textSpeed).toBe(0);
    expect(harness.state.language).toBe('uk');
  });

  it('stores media and audio libraries', () => {
    const harness = createSliceHarness();
    const slice = createLibrariesSlice(harness.set);

    slice.setMediaLibrary([
      { id: 'asset-1', name: 'Asset', uri: 'file:///asset.png', type: 'image', addedAt: 1 },
    ]);
    slice.setAudioLibrary('story-1', [
      {
        id: 'audio-1',
        name: 'Theme',
        uri: 'file:///theme.mp3',
        type: 'music',
        duration: 10,
        createdAt: 1,
      },
    ]);

    expect(harness.state.mediaLibrary.map((asset) => asset.id)).toEqual(['asset-1']);
    expect(harness.state.audioLibraries['story-1'].map((item) => item.id)).toEqual(['audio-1']);
  });

  it('saves and loads scoped reader save slots', () => {
    const harness = createSliceHarness();
    const slice = createSavesSlice(harness.set, harness.get);

    harness.set({
      currentStoryId: 'story-1',
      playbackState: {
        storyId: 'story-1',
        currentSceneId: 'scene-1',
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [{ sceneId: 'scene-1', choiceId: 'choice-1' }],
      },
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
          'scene-1': makeSceneRecord('scene-1'),
        },
      },
    });

    expect(slice.saveGame('slot-1')).toBe(true);
    const loaded = slice.loadGame('slot-1');

    expect(harness.state.saveSlots.map((slot) => slot.id)).toEqual(['slot-1']);
    expect(loaded?.storyId).toBe('story-1');
    expect(loaded?.playbackState.currentSceneId).toBe('scene-1');
    expect(loaded?.playbackState.choicesMade).toEqual([{ sceneId: 'scene-1', choiceId: 'choice-1' }]);
    expect(harness.state.currentStoryId).toBe('story-1');
    expect(harness.state.playbackState?.currentSceneId).toBe('scene-1');
  });

  it('does not report a manual save when the active scene is unavailable', () => {
    const harness = createSliceHarness();
    const slice = createSavesSlice(harness.set, harness.get);

    harness.set({
      currentStoryId: 'story-1',
      playbackState: {
        storyId: 'story-1',
        currentSceneId: 'missing-scene',
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: [],
      },
      storiesMetadata: [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'missing-scene',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 1,
        },
      ],
      sceneRecordsByStory: {},
    });

    expect(slice.saveGame('slot-1')).toBe(false);
    expect(harness.state.saveSlots).toEqual([]);
  });

  it('replaces autosave and deletes save slots', () => {
    const harness = createSliceHarness();
    const slice = createSavesSlice(harness.set, harness.get);

    slice.syncAutoSave({
      id: 'autosave',
      storyId: 'story-1',
      sceneId: 'scene-1',
      choicesMade: [],
      timestamp: 1,
    });
    slice.syncAutoSave({
      id: 'autosave',
      storyId: 'story-1',
      sceneId: 'scene-2',
      choicesMade: [],
      timestamp: 2,
    });
    slice.deleteSaveSlot('autosave');

    expect(harness.state.saveSlots).toEqual([]);
  });

  it('creates a canonical story seed', () => {
    const harness = createSliceHarness();
    const slice = createStorySlice(harness.set);

    const created = slice.createStory('New Story');

    expect(harness.state.storiesMetadata).toHaveLength(1);
    expect(harness.state.storiesMetadata[0]).toMatchObject({
      id: created.storyId,
      title: 'New Story',
      startSceneId: created.sceneId,
      sceneCount: 1,
    });
    expect(harness.state.sceneRecordsByStory[created.storyId][created.sceneId]).toMatchObject({
      id: created.sceneId,
      storyId: created.storyId,
      isStart: true,
    });
  });

  it('deletes stories with their scene records', () => {
    const harness = createSliceHarness();
    const slice = createStorySlice(harness.set);
    harness.set({
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
          'scene-1': makeSceneRecord('scene-1'),
        },
      },
    });

    slice.deleteStory('story-1');

    expect(harness.state.storiesMetadata).toEqual([]);
    expect(harness.state.sceneRecordsByStory).toEqual({});
  });

  it('updates story metadata timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1234);
    const harness = createSliceHarness();
    const slice = createStorySlice(harness.set);
    harness.set({
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
    });

    slice.updateStoryMetadata('story-1', { title: 'Updated' });

    expect(harness.state.storiesMetadata[0]).toMatchObject({
      title: 'Updated',
      updatedAt: 1234,
    });
    vi.useRealTimers();
  });

  it('saves scene records and keeps one canonical start scene', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2000);
    const harness = createSliceHarness();
    const slice = createSceneSlice(harness.set, harness.get);
    harness.set({
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
          'scene-1': makeSceneRecord('scene-1'),
        },
      },
    });

    slice.saveSceneRecord({ ...makeSceneRecord('scene-2'), isStart: true });

    expect(harness.state.storiesMetadata[0].startSceneId).toBe('scene-2');
    expect(harness.state.sceneRecordsByStory['story-1']['scene-1'].isStart).toBe(false);
    expect(harness.state.sceneRecordsByStory['story-1']['scene-2']).toMatchObject({
      isStart: true,
      updatedAt: 2000,
    });
    vi.useRealTimers();
  });

  it('hydrates scene records for one story from storage', async () => {
    const harness = createSliceHarness();
    const storageValues = new Map([
      [
        'vne_scene_records_story-1',
        JSON.stringify(buildSceneRecordStoragePayload(
          'story-1',
          {
            'scene-1': makeSceneRecord('scene-1'),
          },
          1,
        )),
      ],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const slice = createSceneSlice(harness.set, harness.get, storage);

    await slice.hydrateSceneRecordsForStory('story-1');

    expect(harness.state.sceneRecordsByStory['story-1']['scene-1']).toMatchObject({
      id: 'scene-1',
      storyId: 'story-1',
    });
  });

  it('hydrates a bounded reader scene window from storage', async () => {
    const harness = createSliceHarness();
    const storageValues = new Map([
      [
        'vne_scene_records_story-1',
        JSON.stringify(buildSceneRecordStoragePayload(
          'story-1',
          {
            'scene-1': makeSceneRecord('scene-1', 'story-1', [
              { targetSceneId: 'scene-2', outputPort: 'next' },
            ]),
            'scene-2': makeSceneRecord('scene-2'),
            'scene-3': makeSceneRecord('scene-3'),
          },
          1,
        )),
      ],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const slice = createSceneSlice(harness.set, harness.get, storage);

    await expect(slice.hydrateReaderSceneWindow('story-1', 'scene-1')).resolves.toBe(true);

    expect(Object.keys(harness.state.sceneRecordsByStory['story-1'])).toEqual([
      'scene-1',
      'scene-2',
    ]);
    expect(harness.state.sceneRecordHydration['story-1']).toBe('window');
  });

  it('hydrates a bounded reader scene window from per-scene sidecar storage', async () => {
    const harness = createSliceHarness();
    const scene1 = makeSceneRecord('scene-1', 'story-1', [
      { targetSceneId: 'scene-2', outputPort: 'next' },
    ]);
    const scene2 = makeSceneRecord('scene-2');
    const storageValues = new Map([
      [
        'vne_scene_record_story-1_scene-1',
        JSON.stringify(buildSceneRecordItemPayload('story-1', 'scene-1', scene1, 1)),
      ],
      [
        'vne_scene_record_story-1_scene-2',
        JSON.stringify(buildSceneRecordItemPayload('story-1', 'scene-2', scene2, 1)),
      ],
      [
        'vne_scene_records_story-1',
        JSON.stringify(
          buildSceneRecordStoragePayload(
            'story-1',
            {
              'scene-1': scene1,
              'scene-2': scene2,
              'scene-3': makeSceneRecord('scene-3'),
            },
            1,
          ),
        ),
      ],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const slice = createSceneSlice(harness.set, harness.get, storage);

    await expect(slice.hydrateReaderSceneWindow('story-1', 'scene-1')).resolves.toBe(true);

    expect(Object.keys(harness.state.sceneRecordsByStory['story-1'])).toEqual([
      'scene-1',
      'scene-2',
    ]);
    expect(storage.getItem).not.toHaveBeenCalledWith('vne_scene_records_story-1');
  });

  it('prefetches from the in-memory current scene when reader state is newer than storage', async () => {
    const harness = createSliceHarness();
    const oldScene1 = makeSceneRecord('scene-1', 'story-1', [
      { targetSceneId: 'scene-2', outputPort: 'next' },
    ]);
    const currentScene1 = makeSceneRecord('scene-1', 'story-1', [
      { targetSceneId: 'scene-3', outputPort: 'next' },
    ]);
    const scene2 = makeSceneRecord('scene-2');
    const scene3 = makeSceneRecord('scene-3');
    harness.set({
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': currentScene1,
        },
      },
    });
    const storageValues = new Map([
      [
        'vne_scene_record_story-1_scene-1',
        JSON.stringify(buildSceneRecordItemPayload('story-1', 'scene-1', oldScene1, 1)),
      ],
      [
        'vne_scene_record_story-1_scene-2',
        JSON.stringify(buildSceneRecordItemPayload('story-1', 'scene-2', scene2, 1)),
      ],
      [
        'vne_scene_record_story-1_scene-3',
        JSON.stringify(buildSceneRecordItemPayload('story-1', 'scene-3', scene3, 1)),
      ],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const slice = createSceneSlice(harness.set, harness.get, storage);

    await expect(slice.hydrateReaderSceneWindow('story-1', 'scene-1')).resolves.toBe(true);

    expect(Object.keys(harness.state.sceneRecordsByStory['story-1'])).toEqual([
      'scene-1',
      'scene-3',
    ]);
    expect(harness.state.sceneRecordsByStory['story-1']['scene-1'].connections).toEqual([
      { targetSceneId: 'scene-3', outputPort: 'next' },
    ]);
  });

  it('can fully hydrate a story after a bounded reader scene window', async () => {
    const harness = createSliceHarness();
    const storageValues = new Map([
      [
        'vne_scene_records_story-1',
        JSON.stringify(buildSceneRecordStoragePayload(
          'story-1',
          {
            'scene-1': makeSceneRecord('scene-1'),
            'scene-2': makeSceneRecord('scene-2'),
          },
          1,
        )),
      ],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const slice = createSceneSlice(harness.set, harness.get, storage);

    await slice.hydrateReaderSceneWindow('story-1', 'scene-1', 0);
    expect(Object.keys(harness.state.sceneRecordsByStory['story-1'])).toEqual(['scene-1']);
    expect(harness.state.sceneRecordHydration['story-1']).toBe('window');

    await slice.hydrateSceneRecordsForStory('story-1');

    expect(Object.keys(harness.state.sceneRecordsByStory['story-1'])).toEqual([
      'scene-1',
      'scene-2',
    ]);
    expect(harness.state.sceneRecordHydration['story-1']).toBe('full');

    slice.saveSceneRecord({
      ...makeSceneRecord('scene-1'),
      name: 'Edited after full hydrate',
    });

    expect(harness.state.sceneRecordHydration['story-1']).toBe('full');
    expect(Object.keys(harness.state.sceneRecordsByStory['story-1'])).toEqual([
      'scene-1',
      'scene-2',
    ]);
    expect(harness.state.sceneRecordsByStory['story-1']['scene-1'].name).toBe('Edited after full hydrate');
  });

  it('updates scene content while preserving metadata fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(3000);
    const harness = createSliceHarness();
    const slice = createSceneSlice(harness.set, harness.get);
    harness.set({
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
          'scene-1': makeSceneRecord('scene-1'),
        },
      },
    });

    slice.updateSceneRecordPreservingMeta('story-1', 'scene-1', {
      name: 'Renamed Scene',
      tags: ['tag-1'],
    });

    expect(harness.state.sceneRecordsByStory['story-1']['scene-1']).toMatchObject({
      id: 'scene-1',
      name: 'Renamed Scene',
      tags: ['tag-1'],
      createdAt: 1,
      updatedAt: 3000,
    });
    expect(harness.state.storiesMetadata[0].updatedAt).toBe(3000);
    vi.useRealTimers();
  });

  it('updates and removes scene connections', () => {
    const harness = createSliceHarness();
    const slice = createSceneSlice(harness.set, harness.get);
    harness.set({
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': makeSceneRecord('scene-1'),
          'scene-2': makeSceneRecord('scene-2'),
        },
      },
    });

    slice.updateSceneConnection('story-1', 'scene-1', {
      targetSceneId: 'scene-2',
      outputPort: 'next',
    });
    expect(harness.state.sceneRecordsByStory['story-1']['scene-1'].connections).toEqual([
      { targetSceneId: 'scene-2', outputPort: 'next' },
    ]);

    slice.removeSceneConnection('story-1', 'scene-1', 'scene-2', 'next');

    expect(harness.state.sceneRecordsByStory['story-1']['scene-1'].connections).toEqual([]);
  });

  it('reorders existing scenes and appends omitted scene ids', () => {
    const harness = createSliceHarness();
    const slice = createSceneSlice(harness.set, harness.get);
    harness.set({
      storiesMetadata: [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 3,
        },
      ],
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': makeSceneRecord('scene-1'),
          'scene-2': makeSceneRecord('scene-2'),
          'scene-3': makeSceneRecord('scene-3'),
        },
      },
    });

    slice.reorderScenes('story-1', ['scene-3', 'missing']);

    expect(harness.state.storiesMetadata[0].sceneOrder).toEqual([
      'scene-3',
      'scene-1',
      'scene-2',
    ]);
  });
});
