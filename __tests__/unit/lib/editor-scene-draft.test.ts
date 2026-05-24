import { describe, expect, it } from 'vitest';

import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import {
  createEditorSceneDraft,
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

    expect(draft).toEqual({
      sceneId: 'scene-1',
      sceneName: 'Opening Scene',
      timeline: sceneRecord.timeline,
    });
    expect(draft.timeline).not.toBe(sceneRecord.timeline);
  });

  it('derives a stable fallback name for canonical scenes without a title', () => {
    const sceneRecord = makeSceneRecord({ id: 'scene-empty', name: '' });

    const draft = createEditorSceneDraft(sceneRecord);

    expect(draft.sceneName).toBe('Untitled Scene');
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
