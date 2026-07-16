import { applyAiChangeSetToStore } from '@/lib/ai/change-set-adapter';
import { computeCharacterLibraryRevision } from '@/lib/ai/change-set';
import { rollbackTopAppliedChange } from '@/lib/ai/applied-change-journal';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';

function scene(): SceneRecord {
  return {
    id: 'scene-1', storyId: 'story-1', name: 'Before', description: '', tags: [], timeline: [],
    sceneState: { backgroundAssetId: null, backgroundTransition: 'fade', characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: {}, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null },
    flowX: 0, flowY: 0, connections: [], isStart: true, createdAt: 1, updatedAt: 1,
  };
}

describe('AI change-set store adapter', () => {
  beforeEach(() => {
    const record = scene();
    let snapshotState: { scenes: Record<string, SceneRecord>; metadata: StoryMetadata[] } | undefined;
    useAppStore.setState({
      storiesMetadata: [{ id: 'story-1', title: 'Story', startSceneId: 'scene-1', sceneOrder: ['scene-1'], tags: [], createdAt: 1, updatedAt: 1, sceneCount: 1 }],
      sceneRecordsByStory: { 'story-1': { 'scene-1': record } },
      characterLibraries: { 'story-1': [] }, imageAssetIdsByStory: {}, mediaLibrary: [],
      createStorySnapshot: vi.fn(async () => {
        const state = useAppStore.getState();
        snapshotState = { scenes: structuredClone(state.sceneRecordsByStory['story-1']), metadata: structuredClone(state.storiesMetadata) };
        return { id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true };
      }),
      restoreStorySnapshot: vi.fn(async () => {
        if (!snapshotState) return false;
        useAppStore.setState({ sceneRecordsByStory: { 'story-1': structuredClone(snapshotState.scenes) }, storiesMetadata: structuredClone(snapshotState.metadata) });
        return true;
      }),
      setCharacterLibrary: vi.fn((storyId, characters) => useAppStore.setState((state: ReturnType<typeof useAppStore.getState>) => ({ characterLibraries: { ...state.characterLibraries, [storyId]: characters } }))),
      commitAiChangeSet: vi.fn((storyId, result) => {
        const state = useAppStore.getState();
        useAppStore.setState({
          sceneRecordsByStory: { ...state.sceneRecordsByStory, [storyId]: { ...state.sceneRecordsByStory[storyId], ...Object.fromEntries(result.scenesToSave.map((item: SceneRecord) => [item.id, item])) } },
          characterLibraries: result.charactersToSave ? { ...state.characterLibraries, [storyId]: result.charactersToSave } : state.characterLibraries,
          storiesMetadata: state.storiesMetadata.map((metadata: StoryMetadata) => metadata.id === storyId
            ? { ...metadata, sceneOrder: result.nextSceneOrder, sceneCount: Object.keys(state.sceneRecordsByStory[storyId]).length + result.sceneIdsCreated.length }
            : metadata),
        });
      }),
    });
    useAiChatStore.setState({
      activeStoryId: 'story-1',
      appliedChangesByStory: {},
      appliedChanges: [],
      lastAppliedChange: null,
    });
  });

  it('rejects a stale live revision without a snapshot or side effect', async () => {
    const snapshot = useAppStore.getState().createStorySnapshot as ReturnType<typeof vi.fn>;
    const result = await applyAiChangeSetToStore({ storyId: 'story-1', expectedSceneRevisions: { 'scene-1': 'stale' }, explanation: 'rename', items: [{ kind: 'patch_scene', sceneRef: 'scene-1', operations: [{ op: 'update_scene_metadata', updates: { name: 'After' } }] }] });
    expect(result).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    expect(snapshot).not.toHaveBeenCalled();
    expect(useAppStore.getState().sceneRecordsByStory['story-1']['scene-1'].name).toBe('Before');
  });

  it('commits the result and records its automatic rollback snapshot', async () => {
    const record = useAppStore.getState().sceneRecordsByStory['story-1']['scene-1'];
    const result = await applyAiChangeSetToStore({ storyId: 'story-1', expectedSceneRevisions: { 'scene-1': computeSceneRevision(record) }, explanation: 'rename', items: [{ kind: 'patch_scene', sceneRef: 'scene-1', operations: [{ op: 'update_scene_metadata', updates: { name: 'After' } }] }] });
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().sceneRecordsByStory['story-1']['scene-1'].name).toBe('After');
    expect(useAppStore.getState().createStorySnapshot).toHaveBeenCalledWith('story-1', expect.stringContaining('AI: changeset'), true);
    expect(useAiChatStore.getState().appliedChanges.at(-1)).toMatchObject({ kind: 'changeset', snapshotId: 'snap-1', label: 'rename' });
  });

  it('rolls back a new scene, modified scene, scene order, start scene, and new character', async () => {
    const initial = useAppStore.getState();
    const before = {
      sceneRecordsByStory: structuredClone(initial.sceneRecordsByStory),
      storiesMetadata: structuredClone(initial.storiesMetadata),
      characterLibraries: structuredClone(initial.characterLibraries),
    };
    const record = before.sceneRecordsByStory['story-1']['scene-1'];
    const result = await applyAiChangeSetToStore({
      storyId: 'story-1',
      expectedSceneRevisions: { 'scene-1': computeSceneRevision(record) },
      expectedCharacterRevision: computeCharacterLibraryRevision([]),
      explanation: 'branch with Nova',
      items: [
        { kind: 'create_character', character: { tempId: 'newchar:nova', name: 'Nova' } },
        { kind: 'create_scene', tempId: 'new:branch', afterRef: 'scene-1', name: 'Branch', timeline: [] },
        { kind: 'patch_scene', sceneRef: 'scene-1', operations: [{ op: 'update_scene_metadata', updates: { name: 'Modified' } }] },
      ],
    });
    expect(result.ok).toBe(true);
    const applied = useAppStore.getState();
    expect(Object.keys(applied.sceneRecordsByStory['story-1'])).toHaveLength(2);
    expect(applied.sceneRecordsByStory['story-1']['scene-1'].name).toBe('Modified');
    expect(applied.storiesMetadata[0].sceneOrder).toHaveLength(2);
    expect(applied.characterLibraries['story-1'].map((character: { name: string }) => character.name)).toEqual(['Nova']);

    await expect(rollbackTopAppliedChange()).resolves.toEqual({ ok: true });
    const rolledBack = useAppStore.getState();
    expect(rolledBack.sceneRecordsByStory['story-1']).toEqual(before.sceneRecordsByStory['story-1']);
    expect(rolledBack.storiesMetadata[0].sceneOrder).toEqual(['scene-1']);
    expect(rolledBack.storiesMetadata[0].startSceneId).toBe('scene-1');
    expect(rolledBack.characterLibraries['story-1']).toEqual([]);
  });

  it('restores only changed character fields and preserves later sprite edits', async () => {
    const original = {
      id: 'char-1',
      name: 'Before',
      color: '#111111',
      sprites: [{ id: 'sprite-1', name: 'Base', uri: '/base.png', createdAt: 1 }],
      createdAt: 1,
    };
    useAppStore.setState({ characterLibraries: { 'story-1': [original] } });
    const result = await applyAiChangeSetToStore({
      storyId: 'story-1',
      expectedSceneRevisions: {},
      expectedCharacterRevision: computeCharacterLibraryRevision([original]),
      explanation: 'rename character',
      items: [{ kind: 'update_character', update: { characterId: 'char-1', updates: { name: 'After', color: '#222222' } } }],
    });
    expect(result.ok).toBe(true);
    const current = useAppStore.getState().characterLibraries['story-1'][0];
    useAppStore.setState({
      characterLibraries: {
        'story-1': [{ ...current, sprites: [...current.sprites, { id: 'sprite-2', name: 'New', uri: '/new.png', createdAt: 2 }] }],
      },
    });
    await expect(rollbackTopAppliedChange('story-1', true)).resolves.toEqual({ ok: true });
    const restored = useAppStore.getState().characterLibraries['story-1'][0];
    expect(restored).toMatchObject({ name: 'Before', color: '#111111' });
    expect(restored.sprites.map((sprite) => sprite.id)).toEqual(['sprite-1', 'sprite-2']);
  });
});
