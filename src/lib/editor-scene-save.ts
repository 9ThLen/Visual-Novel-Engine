import type { AppState } from '@/stores/use-app-store';
import {
  applyEditorDraftToSceneRecord,
  createSceneRecordFromEditorDraft,
  type EditorSceneDraft,
} from '@/lib/editor-scene-draft';

export function resolveSceneRecordForSave(
  state: Pick<AppState, 'sceneRecordsByStory'>,
  storyId: string,
  sceneId: string,
  draft: EditorSceneDraft,
) {
  const existingRecord = state.sceneRecordsByStory[storyId]?.[sceneId];

  return existingRecord
    ? applyEditorDraftToSceneRecord(existingRecord, draft)
    : createSceneRecordFromEditorDraft(storyId, draft);
}
