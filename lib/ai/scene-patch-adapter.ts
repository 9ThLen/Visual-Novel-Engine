import { getStoryImageAssets } from '@/lib/story-image-library';
import { useAppStore } from '@/stores/use-app-store';
import {
  applyAiScenePatch,
  describeAiScenePatch,
  validateAiScenePatch,
  type PatchProjectContext,
  type ScenePatchDescription,
} from './scene-patch';
import type { AiScenePatch } from './scene-patch-types';
import { capturePostRevisions } from './applied-change-journal';
import { useAiChatStore } from '@/stores/ai-chat-store';

export type ApplyAiScenePatchToStoreResult =
  | { ok: true; snapshotId: string; description: ScenePatchDescription }
  | { ok: false; code: 'STALE_REVISION' | 'VALIDATION_FAILED' | 'SCENE_NOT_FOUND'; errors: string[] };

export async function applyAiScenePatchToStore(patch: AiScenePatch): Promise<ApplyAiScenePatchToStoreResult> {
  const state = useAppStore.getState();
  const scene = state.sceneRecordsByStory[patch.storyId]?.[patch.sceneId];
  if (!scene) return { ok: false, code: 'SCENE_NOT_FOUND', errors: [`Scene '${patch.sceneId}' not found`] };

  const storyScenes = Object.values(state.sceneRecordsByStory[patch.storyId] ?? {});
  const context: PatchProjectContext = {
    sceneIds: storyScenes.map((item) => item.id),
    characterIds: (state.characterLibraries[patch.storyId] ?? []).map((character) => character.id),
    variableNames: Array.from(new Set(storyScenes.flatMap((item) => Object.keys(item.sceneState.variables)))),
    assetIds: getStoryImageAssets(patch.storyId, state.imageAssetIdsByStory, state.mediaLibrary).map((asset) => asset.id),
  };
  const validation = validateAiScenePatch(scene, patch, context);
  if (!validation.ok) return validation;

  const snapshot = await state.createStorySnapshot(patch.storyId, `AI: ${patch.explanation.slice(0, 40)}`, true);
  if (!snapshot) return { ok: false, code: 'VALIDATION_FAILED', errors: ['Could not create rollback snapshot'] };
  const description = describeAiScenePatch(scene, patch);
  state.saveSceneRecord(applyAiScenePatch(scene, patch));
  useAiChatStore.getState().pushAppliedChange({
    kind: 'scene',
    storyId: patch.storyId,
    snapshotId: snapshot.id,
    appliedAt: Date.now(),
    label: patch.explanation,
    postRevisions: capturePostRevisions(patch.storyId),
  });
  return { ok: true, snapshotId: snapshot.id, description };
}

export function rollbackAiPatch(storyId: string, snapshotId: string): Promise<boolean> {
  return useAppStore.getState().restoreStorySnapshot(storyId, snapshotId);
}
