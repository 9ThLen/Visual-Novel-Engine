import type { SceneRecord } from '@/lib/engine/types';
import type { EditorSceneDraft } from '@/lib/editor-scene-draft';
import { resolveSceneRecordForSave } from '@/lib/editor-scene-save';

function makeExistingRecord(): SceneRecord {
  const now = 1000;
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Old Name',
    description: 'kept',
    tags: ['tag'],
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
    flowX: 11,
    flowY: 22,
    connections: [],
    isStart: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeDraft(): EditorSceneDraft {
  return {
    sceneId: 'scene-1',
    sceneName: 'Updated Name',
    timeline: [
      {
        id: 'step-1',
        blockType: 'text',
        data: { content: 'Hello', typewriterSpeed: 0.5, anchorTo: 'background' },
        enabled: true,
        collapsed: false,
      },
    ],
  };
}

describe('resolveSceneRecordForSave', () => {
  it('updates an existing canonical scene record while preserving metadata', () => {
    const existingRecord = makeExistingRecord();
    const record = resolveSceneRecordForSave(
      {
        sceneRecordsByStory: {
          'story-1': {
            'scene-1': existingRecord,
          },
        },
      },
      'story-1',
      'scene-1',
      makeDraft(),
    );

    expect(record.name).toBe('Updated Name');
    expect(record.timeline.map((step) => step.blockType)).toEqual(['background', 'text']);
    expect(record.timeline.some((step) => step.id === 'step-1')).toBe(true);
    expect(record.createdAt).toBe(existingRecord.createdAt);
    expect(record.flowX).toBe(existingRecord.flowX);
    expect(record.isStart).toBe(true);
  });

  it('creates a new scene record when the scene does not exist yet', () => {
    const record = resolveSceneRecordForSave(
      {
        sceneRecordsByStory: {},
      },
      'story-1',
      'scene-1',
      makeDraft(),
    );

    expect(record.id).toBe('scene-1');
    expect(record.storyId).toBe('story-1');
    expect(record.name).toBe('Updated Name');
    expect(record.timeline.map((step) => step.blockType)).toEqual(['background', 'text']);
    expect(record.timeline.some((step) => step.id === 'step-1')).toBe(true);
  });
});
