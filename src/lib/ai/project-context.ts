import { getStoryImageAssets } from '@/lib/story-image-library';
import { useAppStore } from '@/stores/use-app-store';
import type { AiChangeSetState } from './change-set';
import type { PatchProjectContext } from './scene-patch';

type AppStoreState = ReturnType<typeof useAppStore.getState>;

export function buildPatchProjectContext(
  storyId: string,
  state: AppStoreState = useAppStore.getState(),
): PatchProjectContext {
  const storyScenes = Object.values(state.sceneRecordsByStory[storyId] ?? {});
  const characters = state.characterLibraries[storyId] ?? [];
  return {
    sceneIds: storyScenes.map((scene) => scene.id),
    sceneOrder: state.storiesMetadata.find((story) => story.id === storyId)?.sceneOrder,
    characterIds: characters.map((character) => character.id),
    spritesByCharacterId: Object.fromEntries(characters.map((character) => [character.id, character.sprites.map((sprite) => sprite.id)])),
    variableNames: Array.from(new Set(storyScenes.flatMap((scene) => Object.keys(scene.sceneState.variables)))),
    assetIds: getStoryImageAssets(storyId, state.imageAssetIdsByStory, state.mediaLibrary).map((asset) => asset.id),
  };
}

export function buildAiChangeSetState(
  storyId: string,
  state: AppStoreState = useAppStore.getState(),
): AiChangeSetState {
  return {
    scenes: new Map(Object.entries(state.sceneRecordsByStory[storyId] ?? {})),
    characters: state.characterLibraries[storyId] ?? [],
    context: buildPatchProjectContext(storyId, state),
  };
}
