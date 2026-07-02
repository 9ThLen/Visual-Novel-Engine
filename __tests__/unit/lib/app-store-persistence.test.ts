import {
  buildPersistedAppState,
  getPersistableMediaLibrary,
  mergePersistedAppState,
  migratePersistedAppState,
  APP_STORE_PERSIST_VERSION,
  type AppStorePersistenceState,
} from '@/lib/app-store-persistence';
import type { SceneRecord } from '@/lib/engine/types';

function makeSceneRecord(): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Scene 1',
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
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeState(): AppStorePersistenceState {
  return {
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
        'scene-1': makeSceneRecord(),
      },
    },
    sceneRecordHydration: {
      'story-1': 'full',
    },
    currentStoryId: 'story-1',
    playbackState: {
      storyId: 'story-1',
      currentSceneId: 'scene-1',
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: [],
    },
    settings: {
      bgmVolume: 0.7,
      voiceVolume: 0.8,
      sfxVolume: 0.7,
      textSpeed: 0.5,
      textSize: 'medium',
      autoPlay: false,
    },
    saveSlots: [],
    audioLibraries: {},
    characterLibraries: {},
    language: 'en',
    mediaLibrary: [
      {
        id: 'image-file',
        type: 'image',
        uri: 'file:///image.png',
        name: 'Image',
        addedAt: 1,
      },
      {
        id: 'image-data',
        type: 'image',
        uri: 'data:image/png;base64,abc',
        name: 'Inline image',
        addedAt: 1,
      },
    ],
  };
}

describe('app store persistence helpers', () => {
  it('filters inline data URIs from persisted media assets', () => {
    expect(getPersistableMediaLibrary(makeState().mediaLibrary).map((asset) => asset.id)).toEqual([
      'image-file',
    ]);

    expect(buildPersistedAppState(makeState()).mediaLibrary.map((asset) => asset.id)).toEqual([
      'image-file',
    ]);
  });

  it('returns current state when persisted payload is empty or invalid', () => {
    const currentState = makeState();

    expect(mergePersistedAppState(null, currentState)).toBe(currentState);
    expect(mergePersistedAppState('bad-payload', currentState)).toBe(currentState);
  });

  it('normalizes migrated story and character metadata on merge', () => {
    const currentState = makeState();
    const merged = mergePersistedAppState(
      {
        storiesMetadata: [
          {
            id: 'story-2',
            title: 'Persisted story',
            startSceneId: 'scene-a',
            createdAt: 2,
            updatedAt: 2,
            sceneCount: 1,
          },
        ],
        mediaLibrary: [
          {
            id: 'inline',
            type: 'image',
            uri: 'data:image/png;base64,abc',
            name: 'Inline image',
            addedAt: 2,
          },
        ],
        characterLibraries: {
          'story-2': [
            {
              id: 'char-1',
              name: 'Alice',
              sprites: [{ id: 'sprite-1', name: 'Main', uri: 'file:///sprite.png', createdAt: 2 }],
              createdAt: 2,
            },
          ],
        },
      },
      currentState,
    );

    expect(merged.storiesMetadata[0].characterAuthoringSchemaVersion).toBe(1);
    expect(merged.mediaLibrary).toEqual([]);
    expect(merged.characterLibraries['story-2'][0]).toMatchObject({
      color: expect.any(String),
      authoring: {
        currentSpriteId: 'sprite-1',
        currentPosition: 'center',
        focusOnSpeak: true,
      },
      characterAuthoringSchemaVersion: 1,
    });
  });

  it('migrates unversioned persisted payloads without changing the storage shape', () => {
    const migrated = migratePersistedAppState(
      {
        storiesMetadata: makeState().storiesMetadata,
        mediaLibrary: makeState().mediaLibrary,
        characterLibraries: {},
        sceneRecordsByStory: makeState().sceneRecordsByStory,
      },
      0,
    ) as Partial<AppStorePersistenceState>;

    expect(APP_STORE_PERSIST_VERSION).toBe(2);
    expect(migrated.mediaLibrary?.map((asset) => asset.id)).toEqual(['image-file']);
    expect(migrated.sceneRecordsByStory?.['story-1']?.['scene-1']).toBeTruthy();
    expect(migrated.storiesMetadata?.[0].characterAuthoringSchemaVersion).toBe(1);
  });

  it('keeps current fields when older persisted payloads omit them', () => {
    const currentState = makeState();
    const merged = mergePersistedAppState(
      {
        storiesMetadata: currentState.storiesMetadata,
      },
      currentState,
    );

    expect(merged.mediaLibrary).toBe(currentState.mediaLibrary);
    expect(merged.characterLibraries).toBe(currentState.characterLibraries);
    expect(merged.sceneRecordsByStory).toBe(currentState.sceneRecordsByStory);
  });
});
