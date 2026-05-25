export interface PreviewSceneState {
  background: string | null;
  characters: Array<{ id: string; sprite: string; position: string }>;
  music: string | null;
}

export function createPreviewSceneState(): PreviewSceneState {
  return {
    background: null,
    characters: [],
    music: null,
  };
}

export function applyPreviewStepState(
  sceneState: PreviewSceneState,
  step: {
    blockType: string;
    data: Record<string, any>;
  },
): PreviewSceneState {
  const data = step.data ?? {};

  switch (step.blockType) {
    case 'background':
      return data.assetId
        ? { ...sceneState, background: data.assetId }
        : sceneState;
    case 'character':
      return data.characterId
        ? {
            ...sceneState,
            characters: [
              ...sceneState.characters,
              {
                id: data.characterId,
                sprite: data.spriteId ?? '',
                position: data.position ?? 'center',
              },
            ],
          }
        : sceneState;
    case 'music':
      if (data.action === 'stop' || data.action === 'pause') {
        return { ...sceneState, music: null };
      }

      return data.assetId && (data.action === 'play' || !data.action)
        ? { ...sceneState, music: data.assetId }
        : sceneState;
    default:
      return sceneState;
  }
}
