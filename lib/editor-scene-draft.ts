import { updateSceneRecordPreservingMeta } from '@/lib/canonical-scene';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

export interface EditorSceneDraft {
  sceneId: string;
  sceneName: string;
  timeline: TimelineStep[];
}

export interface CurrentEditorSceneDraftState {
  sceneId: string | null;
  isDirty: boolean;
  timelineLength: number;
}

export interface NextEditorSceneDraftState {
  sceneId: string;
  timelineLength: number;
}

function normalizeSceneName(sceneName?: string | null): string {
  const trimmed = sceneName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Untitled Scene';
}

export function createEditorSceneDraft(
  sceneRecord?: Pick<SceneRecord, 'id' | 'name' | 'timeline'> | null,
  fallbackSceneId?: string
): EditorSceneDraft {
  return {
    sceneId: sceneRecord?.id ?? fallbackSceneId ?? '',
    sceneName: normalizeSceneName(sceneRecord?.name),
    timeline: [...(sceneRecord?.timeline ?? [])],
  };
}

export function applyEditorDraftToSceneRecord(
  existingRecord: SceneRecord,
  draft: EditorSceneDraft
): SceneRecord {
  return updateSceneRecordPreservingMeta(existingRecord, {
    name: normalizeSceneName(draft.sceneName),
    timeline: [...draft.timeline],
  });
}

export function createSceneRecordFromEditorDraft(
  storyId: string,
  draft: EditorSceneDraft
): SceneRecord {
  const timestamp = Date.now();

  return {
    id: draft.sceneId,
    storyId,
    name: normalizeSceneName(draft.sceneName),
    description: '',
    tags: [],
    timeline: [...draft.timeline],
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
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function shouldHydrateEditorSceneDraft(
  currentDraft: CurrentEditorSceneDraftState,
  nextDraft: NextEditorSceneDraftState
): boolean {
  if (currentDraft.sceneId !== nextDraft.sceneId) {
    return true;
  }

  if (currentDraft.isDirty) {
    return false;
  }

  return currentDraft.timelineLength === 0 && nextDraft.timelineLength > 0;
}
