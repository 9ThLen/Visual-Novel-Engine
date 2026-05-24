import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyCanonicalSceneDelete,
  createCanonicalStorySeed,
  removeCanonicalConnection,
  syncCanonicalStartScene,
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
    scenesByStory: {},
    sceneRecordsByStory: {},
    currentStoryId: 'story-1',
    playbackState: null,
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
    expect(seed.sceneRecord.timeline.length).toBeGreaterThan(0);
  });
});
