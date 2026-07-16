import { computeAppearanceRevision } from '@/lib/ai/appearance-patch';
import { computeSceneRevision, hashStable } from '@/lib/ai/scene-revision';
import type { StoryMetadata } from '@/lib/story-domain';
import { useAiChatStore, type AiChatAppliedChange } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';

export function computeStoryMetadataRevision(
  metadata: Pick<StoryMetadata, 'title' | 'startSceneId' | 'sceneOrder' | 'tags'>,
): string {
  return hashStable({
    title: metadata.title,
    startSceneId: metadata.startSceneId,
    sceneOrder: metadata.sceneOrder,
    tags: metadata.tags,
  });
}

export function capturePostRevisions(
  storyId: string,
  options: { scope?: 'scene' | 'appearance' | 'changeset'; characterIds?: string[] } = {},
): AiChatAppliedChange['postRevisions'] {
  const state = useAppStore.getState();
  const metadata = state.storiesMetadata.find((story) => story.id === storyId);
  const scope = options.scope ?? 'scene';
  if (scope === 'appearance') {
    return { appearance: computeAppearanceRevision(metadata) };
  }
  const characterIds = new Set(options.characterIds ?? []);
  return {
    scenes: Object.fromEntries(
      Object.values(state.sceneRecordsByStory[storyId] ?? {}).map((scene) => [scene.id, computeSceneRevision(scene)]),
    ),
    ...(scope === 'changeset' && characterIds.size
      ? {
          characters: hashStable((state.characterLibraries[storyId] ?? [])
            .filter((character) => characterIds.has(character.id))
            .map(({ id, name, color }) => ({ id, name, color }))
            .sort((left, right) => left.id.localeCompare(right.id))),
        }
      : {}),
    storyMetadata: metadata ? computeStoryMetadataRevision(metadata) : hashStable(null),
  };
}

export function hasNewerEdits(change: AiChatAppliedChange): boolean {
  const characterIds = change.kind === 'changeset'
    ? [
        ...(change.characterUndo?.createdCharacterIds ?? []),
        ...(change.characterUndo?.previousValues.map(({ id }) => id) ?? []),
      ]
    : [];
  const current = capturePostRevisions(change.storyId, {
    scope: change.kind,
    characterIds,
  });
  if (change.postRevisions.storyMetadata !== undefined
    && current.storyMetadata !== change.postRevisions.storyMetadata) return true;
  if (change.postRevisions.characters !== undefined
    && current.characters !== change.postRevisions.characters) return true;
  if (change.postRevisions.appearance !== undefined
    && current.appearance !== change.postRevisions.appearance) return true;
  const expectedScenes = change.postRevisions.scenes;
  if (!expectedScenes) return false;
  const currentScenes = current.scenes ?? {};
  return Object.keys(currentScenes).length !== Object.keys(expectedScenes).length
    || Object.entries(expectedScenes).some(([id, revision]) => currentScenes[id] !== revision);
}

export async function rollbackTopAppliedChange(
  storyId?: string,
  forceDiscardNewerEdits = false,
): Promise<{ ok: boolean; requiresConfirmation?: boolean }> {
  const chat = useAiChatStore.getState();
  const change = chat.getTopAppliedChange(storyId);
  if (!change) return { ok: false };
  if (!forceDiscardNewerEdits && hasNewerEdits(change)) {
    return { ok: false, requiresConfirmation: true };
  }
  const app = useAppStore.getState();
  let ok: boolean;
  if (change.kind === 'appearance') {
    if (!app.storiesMetadata.some((story) => story.id === change.storyId)) return { ok: false };
    app.updateStoryMetadata(change.storyId, {
      theme: change.previousTheme,
      readerLayoutPreset: change.previousLayoutPreset,
    });
    ok = true;
  } else {
    ok = await app.restoreStorySnapshot(change.storyId, change.snapshotId);
    if (ok && change.kind === 'changeset' && change.characterUndo) {
      const delta = change.characterUndo;
      const created = new Set(delta.createdCharacterIds);
      const previous = new Map(delta.previousValues.map((value) => [value.id, value]));
      const characters = (useAppStore.getState().characterLibraries[change.storyId] ?? [])
        .filter((character) => !created.has(character.id))
        .map((character) => {
          const value = previous.get(character.id);
          return value ? { ...character, name: value.name, color: value.color } : character;
        });
      useAppStore.getState().setCharacterLibrary(change.storyId, characters);
    }
  }
  if (ok) useAiChatStore.getState().popAppliedChange(change.storyId, change);
  return { ok };
}
