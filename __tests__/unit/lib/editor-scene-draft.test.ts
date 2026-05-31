import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import {
  createEditorSceneDraft,
  createSceneRecordFromEditorDraft,
  shouldHydrateEditorSceneDraft,
} from '@/lib/editor-scene-draft';

function makeTimelineStep(overrides: Partial<TimelineStep> = {}): TimelineStep {
  return {
    id: 'step-1',
    blockType: 'text',
    data: {
      content: 'Intro text',
      typewriterSpeed: 0.5,
      anchorTo: 'background',
    },
    collapsed: false,
    enabled: true,
    ...overrides,
  };
}

function makeSceneRecord(overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Opening Scene',
    description: '',
    tags: [],
    timeline: [makeTimelineStep()],
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
    flowX: 10,
    flowY: 20,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('editor-scene-draft', () => {
  it('hydrates editor draft from an existing canonical scene record', () => {
    const sceneRecord = makeSceneRecord();

    const draft = createEditorSceneDraft(sceneRecord);

    expect(draft.sceneId).toBe('scene-1');
    expect(draft.sceneName).toBe('Opening Scene');
    expect(draft.timeline).not.toBe(sceneRecord.timeline);
    expect(draft.timeline.some((step) => step.blockType === 'background')).toBe(true);
    expect(draft.timeline.some((step) => step.id === sceneRecord.timeline[0]?.id)).toBe(true);
  });

  it('derives a stable fallback name for canonical scenes without a title', () => {
    const sceneRecord = makeSceneRecord({ id: 'scene-empty', name: '' });

    const draft = createEditorSceneDraft(sceneRecord);

    expect(draft.sceneName).toBe('Untitled Scene');
  });

  it('adds a default background block when a scene draft has no timeline blocks', () => {
    const draft = createEditorSceneDraft(makeSceneRecord({ timeline: [] }));

    expect(draft.timeline).toHaveLength(1);
    expect(draft.timeline[0]?.blockType).toBe('background');
  });

  it('ensures a scene draft always has exactly one background block regardless of input', () => {
    const sceneRecord = makeSceneRecord({
      timeline: [
        {
          id: 'bg-1',
          blockType: 'background',
          data: { assetId: null, transition: 'fade', duration: 500 },
          collapsed: false,
          enabled: true,
        },
        makeTimelineStep({ id: 'text-1' }),
        {
          id: 'bg-2',
          blockType: 'background',
          data: { assetId: null, transition: 'fade', duration: 500 },
          collapsed: false,
          enabled: true,
        },
      ],
    });

    const draft = createEditorSceneDraft(sceneRecord);

    expect(draft.timeline.filter((step) => step.blockType === 'background')).toHaveLength(1);
  });

  it('creates a scene record with a default background block', () => {
    const record = createSceneRecordFromEditorDraft('story-1', {
      sceneId: 'scene-new',
      sceneName: 'New Scene',
      timeline: [],
    });

    expect(record.timeline).toHaveLength(1);
    expect(record.timeline[0]?.blockType).toBe('background');
  });

  it('hydrates when switching to another scene id', () => {
    expect(
      shouldHydrateEditorSceneDraft(
        { sceneId: 'scene-1', isDirty: true, timelineLength: 2 },
        { sceneId: 'scene-2', timelineLength: 3 }
      )
    ).toBe(true);
  });

  it('does not rehydrate the same dirty scene and wipe in-memory edits', () => {
    expect(
      shouldHydrateEditorSceneDraft(
        { sceneId: 'scene-1', isDirty: true, timelineLength: 3 },
        { sceneId: 'scene-1', timelineLength: 1 }
      )
    ).toBe(false);
  });

  it('rehydrates the same scene when the editor draft is still empty', () => {
    expect(
      shouldHydrateEditorSceneDraft(
        { sceneId: 'scene-1', isDirty: false, timelineLength: 0 },
        { sceneId: 'scene-1', timelineLength: 2 }
      )
    ).toBe(true);
  });
});
