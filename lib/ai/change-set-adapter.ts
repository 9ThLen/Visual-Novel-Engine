import { getStoryImageAssets } from '@/lib/story-image-library';
import type { Character } from '@/lib/character-types';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';
import {
  applyAiChangeSet,
  describeAiChangeSet,
  type AiChangeSet,
  type AiChangeSetDescription,
  type AiChangeSetErrorCode,
} from './change-set';
import { capturePostRevisions } from './applied-change-journal';

export type ApplyAiChangeSetToStoreResult =
  | { ok: true; snapshotId: string; description: AiChangeSetDescription }
  | { ok: false; code: AiChangeSetErrorCode; message: string };

function buildCharacterUndo(before: Character[], after: Character[]) {
  const beforeById = new Map(before.map((character) => [character.id, character]));
  const afterById = new Map(after.map((character) => [character.id, character]));
  return {
    createdCharacterIds: after.filter((character) => !beforeById.has(character.id)).map((character) => character.id),
    previousValues: before
      .filter((character) => {
        const next = afterById.get(character.id);
        return next && (next.name !== character.name || next.color !== character.color);
      })
      .map(({ id, name, color }) => ({ id, name, color })),
  };
}

function buildLiveState(changeSet: AiChangeSet) {
  const state = useAppStore.getState();
  const scenes = new Map(Object.entries(state.sceneRecordsByStory[changeSet.storyId] ?? {}));
  const characters = state.characterLibraries[changeSet.storyId] ?? [];
  return {
    scenes,
    characters,
    context: {
      sceneIds: [...scenes.keys()],
      sceneOrder: state.storiesMetadata.find((story) => story.id === changeSet.storyId)?.sceneOrder,
      characterIds: characters.map((character) => character.id),
      variableNames: Array.from(new Set([...scenes.values()].flatMap((scene) => Object.keys(scene.sceneState.variables)))),
      assetIds: getStoryImageAssets(changeSet.storyId, state.imageAssetIdsByStory, state.mediaLibrary).map((asset) => asset.id),
    },
  };
}

export async function applyAiChangeSetToStore(changeSet: AiChangeSet): Promise<ApplyAiChangeSetToStoreResult> {
  const live = buildLiveState(changeSet);
  const result = applyAiChangeSet(changeSet, live);
  if (!result.ok) return result;

  const state = useAppStore.getState();
  const description = describeAiChangeSet(changeSet, live);
  const previousCharacters = state.characterLibraries[changeSet.storyId] ?? [];
  const snapshot = await state.createStorySnapshot(
    changeSet.storyId,
    `AI: changeset ${new Date().toISOString()}`,
    true,
  );
  if (!snapshot) return { ok: false, code: 'VALIDATION_FAILED', message: 'Could not create rollback snapshot' };

  // Re-read because snapshot creation is async; reject if live revisions changed.
  const revalidated = applyAiChangeSet(changeSet, buildLiveState(changeSet));
  if (!revalidated.ok) return revalidated;
  const characterUndo = revalidated.charactersToSave
    ? buildCharacterUndo(previousCharacters, revalidated.charactersToSave)
    : undefined;
  useAppStore.getState().commitAiChangeSet(changeSet.storyId, revalidated);
  useAiChatStore.getState().pushAppliedChange({
    kind: 'changeset',
    storyId: changeSet.storyId,
    snapshotId: snapshot.id,
    ...(characterUndo === undefined ? {} : { characterUndo }),
    appliedAt: Date.now(),
    label: changeSet.explanation,
    postRevisions: capturePostRevisions(changeSet.storyId, {
      scope: 'changeset',
      characterIds: characterUndo
        ? [...characterUndo.createdCharacterIds, ...characterUndo.previousValues.map(({ id }) => id)]
        : [],
    }),
  });
  return { ok: true, snapshotId: snapshot.id, description };
}

export async function rollbackAiChangeSet(
  undo: { storyId: string; snapshotId: string; characterUndo?: import('@/stores/ai-chat-store').CharacterUndoDelta },
): Promise<boolean> {
  const restored = await useAppStore.getState().restoreStorySnapshot(undo.storyId, undo.snapshotId);
  if (restored && undo.characterUndo) {
    const created = new Set(undo.characterUndo.createdCharacterIds);
    const previous = new Map(undo.characterUndo.previousValues.map((value) => [value.id, value]));
    useAppStore.getState().setCharacterLibrary(undo.storyId,
      (useAppStore.getState().characterLibraries[undo.storyId] ?? [])
        .filter((character) => !created.has(character.id))
        .map((character) => {
          const value = previous.get(character.id);
          return value ? { ...character, name: value.name, color: value.color } : character;
        }));
  }
  return restored;
}
