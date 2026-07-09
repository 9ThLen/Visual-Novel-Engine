import {
  applyCanonicalSceneDelete,
  buildCanonicalSceneRecordsFromLegacyScenes,
  createCanonicalStorySeed,
  removeCanonicalConnection,
  syncCanonicalStartScene,
  upsertCanonicalSceneFromLegacyScene,
} from '@/lib/scene-operations';

function makeSceneRecord(overrides = {}) {
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
    isStart: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createBaseSnapshot() {
  return {
    storiesMetadata: [
      {
        id: 'story-1',
        title: 'Story',
        startSceneId: '',
        createdAt: 1,
        updatedAt: 1,
        sceneCount: 0,
      },
    ],
    sceneRecordsByStory: {},
    currentStoryId: 'story-1',
    playbackState: null,
    settings: {
      bgmVolume: 0.7,
      voiceVolume: 0.8,
      sfxVolume: 0.7,
      textSpeed: 0.5,
      textSize: 'medium',
      readerFontScale: 1,
      readerLineHeightScale: 1.2,
      autoPlay: false,
    },
    saveSlots: [],
    audioLibraries: {},
    characterLibraries: {},
    language: 'en',
    mediaLibrary: [],
    isLoaded: true,
  };
}

let baseSnapshot: ReturnType<typeof createBaseSnapshot>;

describe('use-app-store scene operations', () => {
  beforeEach(() => {
    baseSnapshot = createBaseSnapshot();
  });

  it('aligns start-scene metadata when the first canonical scene is saved', () => {
    const updated = syncCanonicalStartScene(baseSnapshot, 'story-1', {
      sceneRecords: {
        'scene-1': makeSceneRecord({
          id: 'scene-1',
          isStart: true,
        }),
      },
      preferredStartSceneId: 'scene-1',
    });
    const metadata = updated.storiesMetadata[0];

    expect(metadata?.startSceneId).toBe('scene-1');
    expect(updated.sceneRecordsByStory['story-1']?.['scene-1']?.isStart).toBe(true);
  });

  it('deletes a canonical scene and removes orphaned inbound and outbound connections', () => {
    const snapshot = {
      ...baseSnapshot,
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': makeSceneRecord({
        id: 'scene-1',
        isStart: true,
        connections: [{ targetSceneId: 'scene-2', outputPort: 'next' }],
          }),
          'scene-2': makeSceneRecord({
        id: 'scene-2',
        connections: [{ targetSceneId: 'scene-3', outputPort: 'next' }],
          }),
          'scene-3': makeSceneRecord({
        id: 'scene-3',
        connections: [{ targetSceneId: 'scene-2', outputPort: 'branch_a' }],
          }),
        },
      },
    };
    const updated = applyCanonicalSceneDelete(snapshot, 'story-1', 'scene-2');
    const records = updated.sceneRecordsByStory['story-1'];

    expect(records?.['scene-2']).toBeUndefined();
    expect(records?.['scene-1']?.connections).toEqual([]);
    expect(records?.['scene-3']?.connections).toEqual([]);
  });

  it('reassigns start-scene metadata safely when deleting the current start scene', () => {
    const snapshot = {
      ...baseSnapshot,
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': makeSceneRecord({
            id: 'scene-1',
            isStart: true,
          }),
          'scene-2': makeSceneRecord({
            id: 'scene-2',
            createdAt: 2,
            updatedAt: 2,
          }),
        },
      },
    };
    const updated = applyCanonicalSceneDelete(snapshot, 'story-1', 'scene-1');
    const metadata = updated.storiesMetadata[0];
    const records = updated.sceneRecordsByStory['story-1'];

    expect(metadata?.startSceneId).toBe('scene-2');
    expect(records?.['scene-2']?.isStart).toBe(true);
  });

  it('removes only the targeted connection when multiple links share the same target', () => {
    const snapshot = {
      ...baseSnapshot,
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': makeSceneRecord({
            id: 'scene-1',
            connections: [
              { targetSceneId: 'scene-2', outputPort: 'choice_a' },
              { targetSceneId: 'scene-2', outputPort: 'choice_b' },
            ],
          }),
          'scene-2': makeSceneRecord({
            id: 'scene-2',
          }),
        },
      },
    };
    const updated = removeCanonicalConnection(snapshot, 'story-1', 'scene-1', 'scene-2', 'choice_a');

    expect(updated.sceneRecordsByStory['story-1']?.['scene-1']?.connections).toEqual([
      { targetSceneId: 'scene-2', outputPort: 'choice_b' },
    ]);
  });

  it('creates a new story seed directly in canonical metadata and scene-record form', () => {
    const seed = createCanonicalStorySeed('New Story', {
      storyId: 'story-new',
      sceneId: 'scene-start',
      now: 123,
    });

    expect(seed.metadata).toMatchObject({
      id: 'story-new',
      title: 'New Story',
      startSceneId: 'scene-start',
      sceneCount: 1,
      createdAt: 123,
      updatedAt: 123,
    });
    expect(seed.sceneRecord).toMatchObject({
      id: 'scene-start',
      storyId: 'story-new',
      isStart: true,
    });
    expect(seed.sceneRecord.timeline.filter((step) => step.blockType === 'background')).toHaveLength(1);
  });

  it('upserts legacy scene edits into canonical records', () => {
    const updated = upsertCanonicalSceneFromLegacyScene(baseSnapshot, 'story-1', {
      id: 'scene-1',
      text: 'Updated text',
      characters: [],
      choices: [{ id: 'choice-1', text: 'Go', nextSceneId: 'scene-2' }],
      musicUri: null,
    });
    const record = updated.sceneRecordsByStory['story-1']?.['scene-1'];

    expect(record?.timeline.find((step) => step.blockType === 'text')?.data).toMatchObject({
      content: 'Updated text',
    });
    expect(record?.connections).toEqual([
      { targetSceneId: 'scene-2', outputPort: 'choice_0', label: 'Go' },
    ]);
  });

  it('preserves legacy runtime fields when building canonical scene records', () => {
    const records = buildCanonicalSceneRecordsFromLegacyScenes('story-1', {
      'scene-1': {
        id: 'scene-1',
        text: 'Legacy text',
        backgroundImageUri: 'legacy-bg.png',
        characters: [
          {
            id: 'hero',
            name: 'Hero',
            uri: 'hero.png',
            createdAt: 1,
            position: 'left',
          },
        ],
        choices: [],
        musicUri: null,
        voiceAudioUri: 'voice.mp3',
        audioTriggers: [
          { id: 'trigger-1', audioId: 'sfx-1', triggerType: 'scene_start' },
        ],
        interactiveObjects: [
          {
            id: 'door',
            name: 'Door',
            imageUri: 'door.png',
            position: { x: 10, y: 20, width: 30, height: 40 },
            actions: [{ type: 'scene_transition', targetSceneId: 'scene-2' }],
          },
        ],
        autoAdvance: {
          enabled: true,
          delay: 2,
          nextSceneId: 'scene-2',
        },
      },
    }, 'scene-1');

    const record = records['scene-1'];

    expect(record?.voiceAudioUri).toBe('voice.mp3');
    expect(record?.audioTriggers).toEqual([
      { id: 'trigger-1', audioId: 'sfx-1', triggerType: 'scene_start' },
    ]);
    expect(record?.autoAdvance).toEqual({
      enabled: true,
      delay: 2,
      nextSceneId: 'scene-2',
    });
    expect(record?.sceneState.characters).toMatchObject([
      { characterId: 'hero', spriteId: 'hero.png', position: 'left' },
    ]);
    expect(record?.sceneState.interactiveObjects).toHaveLength(1);
    expect(record?.timeline.map((step) => step.blockType)).toEqual([
      'background',
      'character',
      'text',
      'interactive_object',
      'transition',
    ]);
    expect(record?.timeline.find((step) => step.blockType === 'transition')?.data).toMatchObject({
      targetSceneId: 'scene-2',
      duration: 2,
    });
  });

  it('uses legacy blocks as canonical timeline input without dropping audio metadata', () => {
    const records = buildCanonicalSceneRecordsFromLegacyScenes('story-1', {
      'scene-1': {
        id: 'scene-1',
        text: 'Ignored when blocks exist',
        characters: [],
        choices: [],
        musicUri: null,
        voiceAudioUri: 'voice.mp3',
        blocks: [
          {
            id: 'block-text',
            blockType: 'text',
            data: { content: 'Block text', typewriterSpeed: 0.5, anchorTo: 'background' },
            collapsed: false,
            enabled: true,
          },
        ],
      },
    }, 'scene-1');

    const record = records['scene-1'];

    expect(record?.timeline.find((step) => step.id === 'block-text')).toMatchObject({
      id: 'block-text',
      blockType: 'text',
      data: { content: 'Block text' },
    });
    expect(record?.voiceAudioUri).toBe('voice.mp3');
  });

  it('preserves canonical flow metadata when a legacy scene edit updates content', () => {
    const snapshot = {
      ...baseSnapshot,
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': makeSceneRecord({
            flowX: 120,
            flowY: 240,
            createdAt: 10,
          }),
        },
      },
    };

    const updated = upsertCanonicalSceneFromLegacyScene(snapshot, 'story-1', {
      id: 'scene-1',
      text: 'Changed',
      characters: [],
      choices: [],
      musicUri: null,
    });
    const record = updated.sceneRecordsByStory['story-1']?.['scene-1'];

    expect(record?.flowX).toBe(120);
    expect(record?.flowY).toBe(240);
    expect(record?.createdAt).toBe(10);
  });
});
