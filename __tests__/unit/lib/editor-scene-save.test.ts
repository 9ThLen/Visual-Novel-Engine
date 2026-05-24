import { describe, expect, it } from 'vitest';

import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import {
  applyEditorDraftToSceneRecord,
  createEditorSceneDraft,
  type EditorSceneDraft,
} from '@/lib/editor-scene-draft';

function makeTimelineStep(
  id: string,
  content: string,
  overrides: Partial<TimelineStep> = {}
): TimelineStep {
  return {
    id,
    blockType: 'text',
    data: {
      content,
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
    name: 'Original Scene',
    description: 'Metadata description',
    tags: ['intro'],
    timeline: [makeTimelineStep('step-1', 'Original text')],
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
    flowX: 120,
    flowY: 240,
    connections: [{ targetSceneId: 'scene-2', outputPort: 'next' }],
    isStart: true,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe('editor-scene-save', () => {
  it('merges editor draft content into an existing canonical record without wiping metadata', () => {
    const existingRecord = makeSceneRecord();
    const draft: EditorSceneDraft = {
      sceneId: 'scene-1',
      sceneName: 'Updated Scene',
      timeline: [makeTimelineStep('step-2', 'Updated text')],
    };

    const updatedRecord = applyEditorDraftToSceneRecord(existingRecord, draft);

    expect(updatedRecord.name).toBe('Updated Scene');
    expect(updatedRecord.timeline).toEqual(draft.timeline);
    expect(updatedRecord.connections).toEqual(existingRecord.connections);
    expect(updatedRecord.flowX).toBe(120);
    expect(updatedRecord.flowY).toBe(240);
    expect(updatedRecord.isStart).toBe(true);
    expect(updatedRecord.createdAt).toBe(100);
  });

  it('reopens the saved scene with the updated name and timeline', () => {
    const existingRecord = makeSceneRecord();
    const draft: EditorSceneDraft = {
      sceneId: 'scene-1',
      sceneName: 'Saved Scene',
      timeline: [makeTimelineStep('step-3', 'Saved text')],
    };

    const updatedRecord = applyEditorDraftToSceneRecord(existingRecord, draft);
    const reopenedDraft = createEditorSceneDraft(updatedRecord);

    expect(reopenedDraft.sceneId).toBe('scene-1');
    expect(reopenedDraft.sceneName).toBe('Saved Scene');
    expect(reopenedDraft.timeline).toEqual(draft.timeline);
  });
});
