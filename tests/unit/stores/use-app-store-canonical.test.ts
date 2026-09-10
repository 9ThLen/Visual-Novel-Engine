import {
  getCanonicalSceneRecordFromState,
  getCanonicalSceneRecordsForStoryFromState,
  updateSceneRecordPreservingMeta,
} from '@/lib/scene-operations';

const baseState = {
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
      'scene-1': {
        id: 'scene-1',
        storyId: 'story-1',
        name: 'Canonical Scene',
        description: 'desc',
        tags: ['intro'],
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
        flowX: 20,
        flowY: 40,
        connections: [{ targetSceneId: 'scene-2', outputPort: 'next' }],
        isStart: true,
        createdAt: 10,
        updatedAt: 10,
      },
    },
  },
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
    parallaxEnabled: true,
  },
  saveSlots: [],
  audioLibraries: {},
  characterLibraries: {},
  language: 'en',
  mediaLibrary: [],
  isLoaded: true,
} as any;

describe('use-app-store canonical scene helpers', () => {
  it('selects the canonical scene record before any legacy representation', () => {
    const sceneRecord = getCanonicalSceneRecordFromState(baseState, 'story-1', 'scene-1');

    expect(sceneRecord?.name).toBe('Canonical Scene');
    expect(sceneRecord?.connections).toEqual([{ targetSceneId: 'scene-2', outputPort: 'next' }]);
  });

  it('does not synthesize canonical scene records from legacy scenes on the default selector path', () => {
    const sceneRecord = getCanonicalSceneRecordFromState(
      {
        ...baseState,
        sceneRecordsByStory: {},
      },
      'story-1',
      'scene-1'
    );

    expect(sceneRecord).toBeUndefined();
  });

  it('returns canonical scene records for a story sorted by creation time', () => {
    const state = {
      ...baseState,
      sceneRecordsByStory: {
        ...baseState.sceneRecordsByStory,
        'story-1': {
          ...baseState.sceneRecordsByStory['story-1'],
          'scene-2': {
            ...baseState.sceneRecordsByStory['story-1']['scene-1'],
            id: 'scene-2',
            name: 'Second Scene',
            createdAt: 20,
            updatedAt: 20,
          },
          'scene-0': {
            ...baseState.sceneRecordsByStory['story-1']['scene-1'],
            id: 'scene-0',
            name: 'First Scene',
            createdAt: 5,
            updatedAt: 5,
          },
        },
      },
    } as any;

    const records = getCanonicalSceneRecordsForStoryFromState(state, 'story-1');

    expect(records.map((record) => record.id)).toEqual(['scene-0', 'scene-1', 'scene-2']);
  });

  it('returns canonical scene records using explicit sceneOrder when present', () => {
    const state = {
      ...baseState,
      storiesMetadata: [
        {
          ...baseState.storiesMetadata[0],
          sceneOrder: ['scene-2', 'scene-1', 'scene-0'],
        },
      ],
      sceneRecordsByStory: {
        ...baseState.sceneRecordsByStory,
        'story-1': {
          ...baseState.sceneRecordsByStory['story-1'],
          'scene-2': {
            ...baseState.sceneRecordsByStory['story-1']['scene-1'],
            id: 'scene-2',
            name: 'Second Scene',
            createdAt: 20,
            updatedAt: 20,
          },
          'scene-0': {
            ...baseState.sceneRecordsByStory['story-1']['scene-1'],
            id: 'scene-0',
            name: 'First Scene',
            createdAt: 5,
            updatedAt: 5,
          },
        },
      },
    } as any;

    const records = getCanonicalSceneRecordsForStoryFromState(state, 'story-1');

    expect(records.map((record) => record.id)).toEqual(['scene-2', 'scene-1', 'scene-0']);
  });


  it('returns no scene records when canonical records are absent', () => {
    const records = getCanonicalSceneRecordsForStoryFromState(
      {
        ...baseState,
        sceneRecordsByStory: {},
      },
      'story-1'
    );

    expect(records).toEqual([]);
  });

  it('preserves scene metadata when updating canonical scene content', () => {
    const existingRecord = baseState.sceneRecordsByStory['story-1']['scene-1'];
    const updated = updateSceneRecordPreservingMeta(existingRecord, {
      name: 'Updated Scene',
      timeline: [
        {
          id: 'step-1',
          blockType: 'text',
          data: {
            content: 'Updated text',
            typewriterSpeed: 0.5,
            anchorTo: 'background',
          },
          collapsed: false,
          enabled: true,
        },
      ],
    });

    expect(updated?.name).toBe('Updated Scene');
    expect(updated?.flowX).toBe(20);
    expect(updated?.flowY).toBe(40);
    expect(updated?.connections).toEqual([{ targetSceneId: 'scene-2', outputPort: 'next' }]);
    expect(updated?.createdAt).toBe(10);
  });
});
