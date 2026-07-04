import {
  buildPersistedAppState,
  getPersistableMediaLibrary,
  mergePersistedAppState,
  migratePersistedAppState,
  APP_STORE_PERSIST_VERSION,
  MAX_DATA_URI_ASSET_BYTES,
  MAX_TOTAL_DATA_URI_BYTES,
  type AppStorePersistenceState,
} from '@/lib/app-store-persistence';
import type { SceneRecord } from '@/lib/engine/types';
import { resolveLibraryAssetUri } from '@/lib/media-library-service';

function makeDataImageUri(decodedBytes: number): string {
  const base64Length = Math.ceil((decodedBytes * 4) / 3);
  return `data:image/png;base64,${'A'.repeat(base64Length)}`;
}

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
  it('persists file media assets and small inline image data uris', () => {
    expect(getPersistableMediaLibrary(makeState().mediaLibrary).map((asset) => asset.id)).toEqual([
      'image-file',
      'image-data',
    ]);

    expect(buildPersistedAppState(makeState()).mediaLibrary.map((asset) => asset.id)).toEqual([
      'image-file',
      'image-data',
    ]);
  });

  it('filters unsafe and oversized inline image data uris from persisted media assets', () => {
    const persisted = getPersistableMediaLibrary([
      {
        id: 'small-image',
        type: 'image',
        uri: makeDataImageUri(MAX_DATA_URI_ASSET_BYTES),
        name: 'Small image',
        addedAt: 1,
      },
      {
        id: 'large-image',
        type: 'image',
        uri: makeDataImageUri(MAX_DATA_URI_ASSET_BYTES + 1),
        name: 'Large image',
        addedAt: 1,
      },
      {
        id: 'svg-image',
        type: 'image',
        uri: 'data:image/svg+xml;base64,PHN2Zy8+',
        name: 'Svg image',
        addedAt: 1,
      },
      {
        id: 'audio-data',
        type: 'audio',
        uri: 'data:audio/mpeg;base64,QUJD',
        name: 'Audio',
        addedAt: 1,
      },
    ]).map((asset) => asset.id);

    expect(persisted).toEqual(['small-image']);
  });

  it('drops largest inline image data uris until the total inline storage limit fits', () => {
    const persisted = getPersistableMediaLibrary([
      {
        id: 'image-240',
        type: 'image',
        uri: makeDataImageUri(240 * 1024),
        name: 'Image 240',
        addedAt: 1,
      },
      {
        id: 'image-230',
        type: 'image',
        uri: makeDataImageUri(230 * 1024),
        name: 'Image 230',
        addedAt: 1,
      },
      {
        id: 'image-220',
        type: 'image',
        uri: makeDataImageUri(220 * 1024),
        name: 'Image 220',
        addedAt: 1,
      },
      {
        id: 'image-210',
        type: 'image',
        uri: makeDataImageUri(210 * 1024),
        name: 'Image 210',
        addedAt: 1,
      },
      {
        id: 'image-200',
        type: 'image',
        uri: makeDataImageUri(200 * 1024),
        name: 'Image 200',
        addedAt: 1,
      },
    ]).map((asset) => asset.id);

    expect(MAX_TOTAL_DATA_URI_BYTES).toBe(1024 * 1024);
    expect(persisted).toEqual(['image-230', 'image-220', 'image-210', 'image-200']);
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
    expect(merged.mediaLibrary.map((asset) => asset.id)).toEqual(['inline']);
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

    expect(APP_STORE_PERSIST_VERSION).toBe(3);
    expect(migrated.mediaLibrary?.map((asset) => asset.id)).toEqual(['image-file', 'image-data']);
    expect(migrated.sceneRecordsByStory?.['story-1']?.['scene-1']).toBeTruthy();
    expect(migrated.storiesMetadata?.[0].characterAuthoringSchemaVersion).toBe(1);
  });

  it('migrates persisted legacy audio blocks while preserving the app store shape', () => {
    const legacyScene: SceneRecord = {
      ...makeSceneRecord(),
      timeline: [
        {
          id: 'music-1',
          sceneId: 'scene-1',
          blockType: 'music',
          order: 0,
          data: {
            action: 'play',
            assetId: 'bgm',
            volume: 0.6,
            loop: true,
            fadeDuration: 1200,
          },
        },
        {
          id: 'sound-1',
          sceneId: 'scene-1',
          blockType: 'sound',
          order: 1,
          data: {
            action: 'stop',
            assetId: 'rain',
          },
        },
      ] as unknown as SceneRecord['timeline'],
    };
    const persisted = {
      ...makeState(),
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': legacyScene,
        },
      },
    };

    const migrated = migratePersistedAppState(persisted, 2) as Partial<AppStorePersistenceState>;
    const merged = mergePersistedAppState(persisted, makeState());

    expect(migrated.sceneRecordsByStory?.['story-1']?.['scene-1']?.timeline[0].data).toMatchObject({
      mode: 'track',
      assetId: 'bgm',
      fadeIn: 1.2,
      boundTo: 'continuous',
    });
    expect(migrated.sceneRecordsByStory?.['story-1']?.['scene-1']?.timeline[1].data).toMatchObject({
      mode: 'silence',
      assetId: 'rain',
      loop: true,
    });
    expect(merged.sceneRecordsByStory['story-1']['scene-1'].timeline[0].data).toMatchObject({
      mode: 'track',
      fadeIn: 1.2,
    });
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

  it('roundtrips a small uploaded background asset through persistence and rehydrate', () => {
    const currentState = makeState();
    const uploadedAsset = {
      id: 'uploaded-background',
      type: 'image' as const,
      uri: makeDataImageUri(32),
      name: 'Background',
      addedAt: 2,
    };
    const stateWithUpload: AppStorePersistenceState = {
      ...currentState,
      mediaLibrary: [uploadedAsset],
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': {
            ...makeSceneRecord(),
            sceneState: {
              ...makeSceneRecord().sceneState,
              backgroundAssetId: uploadedAsset.id,
            },
          },
        },
      },
    };

    const persisted = buildPersistedAppState(stateWithUpload);
    const rehydrated = mergePersistedAppState(persisted, currentState);
    const backgroundAssetId =
      rehydrated.sceneRecordsByStory['story-1']['scene-1'].sceneState.backgroundAssetId;

    expect(backgroundAssetId).toBe(uploadedAsset.id);
    expect(resolveLibraryAssetUri(backgroundAssetId, rehydrated.mediaLibrary)).toBe(uploadedAsset.uri);
  });
});
