import { applyAiScenePatchToStore, rollbackAiPatch } from '@/lib/ai/scene-patch-adapter';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import type { SceneRecord } from '@/lib/engine/types';
import { useAppStore } from '@/stores/use-app-store';

function scene(): SceneRecord {
  return { id: 'scene-1', storyId: 'story-1', name: 'Before', description: '', tags: [], timeline: [], sceneState: { backgroundAssetId: null, backgroundTransition: 'fade', characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: { score: 0 }, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null }, flowX: 0, flowY: 0, connections: [], isStart: true, createdAt: 1, updatedAt: 1 };
}

function patch(record: SceneRecord): AiScenePatch {
  return { storyId: record.storyId, sceneId: record.id, expectedRevision: computeSceneRevision(record), explanation: 'Rename the scene', operations: [{ op: 'update_scene_metadata', updates: { name: 'After' } }] };
}

describe('scene patch store adapter', () => {
  beforeEach(() => useAppStore.setState({ storiesMetadata: [], sceneRecordsByStory: {}, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [] }));

  it('creates the snapshot before saving the applied record', async () => {
    const record = scene();
    const order: string[] = [];
    const createStorySnapshot = vi.fn(async () => { order.push('snapshot'); return { id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true }; });
    const saveSceneRecord = vi.fn(() => order.push('save'));
    useAppStore.setState({ sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [], createStorySnapshot, saveSceneRecord });

    const result = await applyAiScenePatchToStore(patch(record));

    expect(result).toMatchObject({ ok: true, snapshotId: 'snap-1' });
    expect(order).toEqual(['snapshot', 'save']);
    expect(saveSceneRecord).toHaveBeenCalledWith(expect.objectContaining({ name: 'After' }));
  });

  it('does not mutate the store for an invalid patch', async () => {
    const record = scene();
    const createStorySnapshot = vi.fn();
    const saveSceneRecord = vi.fn();
    useAppStore.setState({ sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [], createStorySnapshot, saveSceneRecord });
    const invalid = patch(record);
    invalid.operations = [{ op: 'delete_steps', stepIds: ['missing'] }];

    expect(await applyAiScenePatchToStore(invalid)).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(createStorySnapshot).not.toHaveBeenCalled();
    expect(saveSceneRecord).not.toHaveBeenCalled();
  });

  it('passes through stale revisions', async () => {
    const record = scene();
    const createStorySnapshot = vi.fn();
    useAppStore.setState({ sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [], createStorySnapshot, saveSceneRecord: vi.fn() });
    const stale = patch(record); stale.expectedRevision = 'stale';
    expect(await applyAiScenePatchToStore(stale)).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    expect(createStorySnapshot).not.toHaveBeenCalled();
  });

  it('delegates rollback to snapshot restore', async () => {
    const restoreStorySnapshot = vi.fn().mockResolvedValue(true);
    useAppStore.setState({ restoreStorySnapshot });
    await expect(rollbackAiPatch('story-1', 'snap-1')).resolves.toBe(true);
    expect(restoreStorySnapshot).toHaveBeenCalledWith('story-1', 'snap-1');
  });
});
