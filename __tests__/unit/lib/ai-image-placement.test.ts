import { applyImportedImagePlacement } from '@/lib/ai/image-placement';
import type { SceneRecord } from '@/lib/engine/types';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';

function scene(): SceneRecord {
  return {
    id: 'scene-1', storyId: 'story-1', name: 'Scene', description: '', tags: [], timeline: [],
    sceneState: { backgroundAssetId: null, backgroundTransition: 'fade', characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: {}, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null },
    flowX: 0, flowY: 0, connections: [], isStart: true, createdAt: 1, updatedAt: 1,
  };
}

function configureStore(record: SceneRecord, linkedAssets = ['asset-1']) {
  const createStorySnapshot = vi.fn(async () => ({ id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true }));
  const saveSceneRecord = vi.fn((next: SceneRecord) => {
    useAppStore.setState((state) => ({
      sceneRecordsByStory: {
        ...state.sceneRecordsByStory,
        [next.storyId]: { ...(state.sceneRecordsByStory[next.storyId] ?? {}), [next.id]: next },
      },
    }));
  });
  useAppStore.setState({
    storiesMetadata: [], sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {},
    imageAssetIdsByStory: { 'story-1': linkedAssets },
    mediaLibrary: [{ id: 'asset-1', type: 'image', uri: 'idb://media/asset-1', name: 'generated.png', addedAt: 1 }],
    createStorySnapshot, saveSceneRecord,
  });
  return { createStorySnapshot, saveSceneRecord };
}

describe('AI image placement', () => {
  beforeEach(() => {
    useAiChatStore.setState({ appliedChanges: [] });
  });

  it('inserts a generated background once across repeated cleanup retries', async () => {
    const initial = scene();
    const store = configureStore(initial);
    const placement = { kind: 'scene_background' as const, operation: 'insert' as const, sceneId: initial.id, afterStepId: null };

    await expect(applyImportedImagePlacement('story-1', 'request-1', 'asset-1', placement)).resolves.toMatchObject({ ok: true, alreadyApplied: false });
    await expect(applyImportedImagePlacement('story-1', 'request-1', 'asset-1', placement)).resolves.toMatchObject({ ok: true, alreadyApplied: true });

    const timeline = useAppStore.getState().sceneRecordsByStory['story-1']['scene-1'].timeline;
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ id: 'ai-image-request-1', blockType: 'background', data: { assetId: 'asset-1' } });
    expect(store.createStorySnapshot).toHaveBeenCalledOnce();
    expect(store.saveSceneRecord).toHaveBeenCalledOnce();
  });

  it('rejects placement before import when the asset is not linked to the story', async () => {
    const initial = scene();
    const store = configureStore(initial, []);
    const result = await applyImportedImagePlacement('story-1', 'request-1', 'asset-1', {
      kind: 'scene_background', operation: 'insert', sceneId: initial.id,
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("assetId 'asset-1' does not exist") });
    expect(store.createStorySnapshot).not.toHaveBeenCalled();
    expect(useAppStore.getState().sceneRecordsByStory['story-1']['scene-1']).toBe(initial);
  });

  it('keeps the imported asset and leaves the scene unchanged when snapshot creation fails', async () => {
    const initial = scene();
    configureStore(initial);
    useAppStore.setState({ createStorySnapshot: vi.fn(async () => null) });

    const result = await applyImportedImagePlacement('story-1', 'request-1', 'asset-1', {
      kind: 'scene_background', operation: 'insert', sceneId: initial.id,
    });

    expect(result).toMatchObject({ ok: false });
    expect(useAppStore.getState().imageAssetIdsByStory['story-1']).toEqual(['asset-1']);
    expect(useAppStore.getState().mediaLibrary).toHaveLength(1);
    expect(useAppStore.getState().sceneRecordsByStory['story-1']['scene-1']).toBe(initial);
  });

  it('attaches a generated sprite and places its character block atomically', async () => {
    const initial = scene();
    const store = configureStore(initial);
    const character = { id: 'char-1', name: 'Nova', sprites: [], createdAt: 1 };
    const commitAiChangeSet = vi.fn((storyId: string, result: import('@/lib/ai/change-set').AiChangeSetApplyResult & { ok: true }) => {
      const state = useAppStore.getState();
      useAppStore.setState({
        characterLibraries: result.charactersToSave ? { ...state.characterLibraries, [storyId]: result.charactersToSave } : state.characterLibraries,
        sceneRecordsByStory: {
          ...state.sceneRecordsByStory,
          [storyId]: { ...state.sceneRecordsByStory[storyId], ...Object.fromEntries(result.scenesToSave.map((record) => [record.id, record])) },
        },
      });
    });
    useAppStore.setState({ characterLibraries: { 'story-1': [character] }, commitAiChangeSet });
    const placement = {
      kind: 'character_sprite' as const,
      characterId: character.id,
      spriteName: 'Happy',
      setAsDefault: true,
      scenePlacement: { sceneId: initial.id, operation: 'insert' as const, position: 'right' as const },
    };

    await expect(applyImportedImagePlacement('story-1', 'request-sprite', 'asset-1', placement)).resolves.toMatchObject({ ok: true, alreadyApplied: false });
    await expect(applyImportedImagePlacement('story-1', 'request-sprite', 'asset-1', placement)).resolves.toMatchObject({ ok: true, alreadyApplied: true });

    const appliedCharacter = useAppStore.getState().characterLibraries['story-1'][0];
    expect(appliedCharacter.sprites).toHaveLength(1);
    expect(appliedCharacter.sprites[0]).toMatchObject({ name: 'Happy', uri: 'asset-1' });
    expect(appliedCharacter.defaultSpriteId).toBe(appliedCharacter.sprites[0].id);
    expect(useAppStore.getState().sceneRecordsByStory['story-1']['scene-1'].timeline[0]).toMatchObject({
      id: 'ai-character-request-sprite',
      blockType: 'character',
      data: { characterId: 'char-1', spriteId: appliedCharacter.sprites[0].id, position: 'right' },
    });
    expect(store.createStorySnapshot).toHaveBeenCalledOnce();
    expect(commitAiChangeSet).toHaveBeenCalledOnce();
  });

  it('places an already imported character sprite into a scene instead of silently stopping', async () => {
    const initial = scene();
    const store = configureStore(initial);
    const character = {
      id: 'char-1', name: 'Nova', createdAt: 1,
      sprites: [{ id: 'sprite-existing', name: 'Happy', uri: 'asset-1', createdAt: 1 }],
    };
    const commitAiChangeSet = vi.fn((storyId: string, result: import('@/lib/ai/change-set').AiChangeSetApplyResult & { ok: true }) => {
      const state = useAppStore.getState();
      useAppStore.setState({
        sceneRecordsByStory: {
          ...state.sceneRecordsByStory,
          [storyId]: { ...state.sceneRecordsByStory[storyId], ...Object.fromEntries(result.scenesToSave.map((record) => [record.id, record])) },
        },
      });
    });
    useAppStore.setState({ characterLibraries: { 'story-1': [character] }, commitAiChangeSet });

    const result = await applyImportedImagePlacement('story-1', 'request-existing', 'asset-1', {
      kind: 'character_sprite', characterId: character.id, spriteName: 'Happy',
      scenePlacement: { sceneId: initial.id, operation: 'insert', position: 'left' },
    });

    expect(result).toMatchObject({ ok: true, alreadyApplied: false, stepId: 'ai-character-request-existing' });
    expect(useAppStore.getState().characterLibraries['story-1'][0].sprites).toHaveLength(1);
    expect(useAppStore.getState().sceneRecordsByStory['story-1']['scene-1'].timeline[0]).toMatchObject({
      id: 'ai-character-request-existing',
      data: { characterId: 'char-1', spriteId: 'sprite-existing', position: 'left' },
    });
    expect(store.createStorySnapshot).toHaveBeenCalledOnce();
    expect(commitAiChangeSet).toHaveBeenCalledOnce();
  });
});
