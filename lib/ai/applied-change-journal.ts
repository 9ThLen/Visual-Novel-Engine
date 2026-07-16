import { computeAppearanceRevision } from '@/lib/ai/appearance-patch';
import { computeCharacterLibraryRevision } from '@/lib/ai/change-set';
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
  options: { characters?: boolean; appearance?: boolean } = {},
): AiChatAppliedChange['postRevisions'] {
  const state = useAppStore.getState();
  const metadata = state.storiesMetadata.find((story) => story.id === storyId);
  return {
    scenes: Object.fromEntries(
      Object.values(state.sceneRecordsByStory[storyId] ?? {}).map((scene) => [scene.id, computeSceneRevision(scene)]),
    ),
    ...(options.characters
      ? { characters: computeCharacterLibraryRevision(state.characterLibraries[storyId] ?? []) }
      : {}),
    storyMetadata: metadata ? computeStoryMetadataRevision(metadata) : hashStable(null),
    ...(options.appearance ? { appearance: computeAppearanceRevision(metadata) } : {}),
  };
}

export function hasNewerEdits(change: AiChatAppliedChange): boolean {
  const current = capturePostRevisions(change.storyId, {
    characters: change.postRevisions.characters !== undefined,
    appearance: change.postRevisions.appearance !== undefined,
  });
  if (current.storyMetadata !== change.postRevisions.storyMetadata) return true;
  if (current.characters !== change.postRevisions.characters) return true;
  if (current.appearance !== change.postRevisions.appearance) return true;
  const expectedScenes = change.postRevisions.scenes;
  return Object.keys(current.scenes).length !== Object.keys(expectedScenes).length
    || Object.entries(expectedScenes).some(([id, revision]) => current.scenes[id] !== revision);
}

export async function rollbackTopAppliedChange(
  forceDiscardNewerEdits = false,
): Promise<{ ok: boolean; requiresConfirmation?: boolean }> {
  const chat = useAiChatStore.getState();
  const change = chat.appliedChanges.at(-1);
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
    if (ok && change.kind === 'changeset' && change.previousCharacterLibrary) {
      useAppStore.getState().setCharacterLibrary(change.storyId, change.previousCharacterLibrary);
    }
  }
  if (ok) useAiChatStore.getState().popAppliedChange();
  return { ok };
}
