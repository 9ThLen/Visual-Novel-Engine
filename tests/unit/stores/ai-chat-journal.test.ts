import {
  reconcileAppliedChanges,
  useAiChatStore,
  type AiChatAppliedChange,
} from '@/stores/ai-chat-store';
import { capturePostRevisions, hasNewerEdits } from '@/lib/ai/applied-change-journal';
import { useAppStore } from '@/stores/use-app-store';
import { notifySnapshotEvicted } from '@/stores/snapshot-eviction-registry';

function entry(index: number): AiChatAppliedChange {
  return {
    kind: 'scene', storyId: 'story-1', snapshotId: `snap-${index}`,
    appliedAt: index, label: `change-${index}`,
    postRevisions: { scenes: {}, storyMetadata: `metadata-${index}` },
  };
}

describe('AI applied-change journal', () => {
  beforeEach(() => {
    useAiChatStore.setState({
      activeStoryId: 'story-1',
      appliedChangesByStory: {},
      appliedChanges: [],
      lastAppliedChange: null,
    });
  });

  it('is capped at ten entries and pops strictly from the top', () => {
    for (let index = 0; index < 12; index += 1) useAiChatStore.getState().pushAppliedChange(entry(index));
    expect(useAiChatStore.getState().appliedChanges.map((change) => change.label)).toEqual(
      Array.from({ length: 10 }, (_, offset) => `change-${offset + 2}`),
    );
    expect(useAiChatStore.getState().popAppliedChange()?.label).toBe('change-11');
    expect(useAiChatStore.getState().appliedChanges.at(-1)?.label).toBe('change-10');
  });

  it('keeps journals isolated by story and exposes only the active story', () => {
    useAiChatStore.getState().pushAppliedChange(entry(1));
    useAiChatStore.getState().pushAppliedChange({ ...entry(2), storyId: 'story-2' });
    expect(useAiChatStore.getState().appliedChanges.map((change) => change.storyId)).toEqual(['story-1']);
    expect(useAiChatStore.getState().getTopAppliedChange('story-2')?.label).toBe('change-2');
    useAiChatStore.getState().setActiveStory('story-2');
    expect(useAiChatStore.getState().appliedChanges.map((change) => change.storyId)).toEqual(['story-2']);
    expect(useAiChatStore.getState().popAppliedChange('story-2')?.label).toBe('change-2');
    expect(useAiChatStore.getState().getTopAppliedChange('story-1')?.label).toBe('change-1');
  });

  it('drops entries whose rollback snapshot was evicted', () => {
    useAiChatStore.getState().pushAppliedChange(entry(1));
    useAiChatStore.getState().pushAppliedChange(entry(2));
    useAiChatStore.getState().dropAppliedChangesForSnapshot('story-1', 'snap-1');
    expect(useAiChatStore.getState().appliedChanges.map((change) =>
      'snapshotId' in change ? change.snapshotId : null)).toEqual(['snap-2']);
  });

  // The app store reaches the journal only through the eviction registry —
  // importing ai-chat-store directly would close a require cycle that crashes
  // Metro at startup. Cover the wiring, not just the action it calls.
  it('drops entries when the snapshot module reports an eviction', () => {
    useAiChatStore.getState().pushAppliedChange(entry(1));
    useAiChatStore.getState().pushAppliedChange(entry(2));
    notifySnapshotEvicted('story-1', 'snap-1');
    expect(useAiChatStore.getState().appliedChanges.map((change) =>
      'snapshotId' in change ? change.snapshotId : null)).toEqual(['snap-2']);
  });

  it.each([
    ['scene', (state: ReturnType<typeof useAppStore.getState>) => { state.sceneRecordsByStory['story-1']['scene-1'].name = 'Manual'; }, true],
    ['title', (state: ReturnType<typeof useAppStore.getState>) => { state.storiesMetadata[0].title = 'Manual'; }, true],
    ['order', (state: ReturnType<typeof useAppStore.getState>) => { state.storiesMetadata[0].sceneOrder = ['scene-2', 'scene-1']; }, true],
    ['theme', (state: ReturnType<typeof useAppStore.getState>) => { state.storiesMetadata[0].theme = { dialogueBg: '#000000' }; }, false],
  ])('scope-aware scene rollback after a manual %s edit', (_dimension, mutate, expected) => {
    const record = { id: 'scene-1', storyId: 'story-1', name: 'Scene', description: '', tags: [], timeline: [], sceneState: { backgroundAssetId: null, backgroundTransition: 'fade' as const, characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: {}, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null }, connections: [], isStart: true, flowX: 0, flowY: 0, createdAt: 1, updatedAt: 1 };
    useAppStore.setState({
      sceneRecordsByStory: { 'story-1': { 'scene-1': record } },
      storiesMetadata: [{ id: 'story-1', title: 'Story', startSceneId: 'scene-1', sceneOrder: ['scene-1'], tags: [], theme: {}, createdAt: 1, updatedAt: 1, sceneCount: 1 }],
      characterLibraries: { 'story-1': [] },
    });
    const change = { ...entry(1), postRevisions: capturePostRevisions('story-1') };
    mutate(useAppStore.getState());
    expect(hasNewerEdits(change)).toBe(expected);
  });

  it('appearance rollback ignores scenes but detects later appearance edits', () => {
    const record = { id: 'scene-1', storyId: 'story-1', name: 'Scene', description: '', tags: [], timeline: [], sceneState: { backgroundAssetId: null, backgroundTransition: 'fade' as const, characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: {}, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null }, connections: [], isStart: true, flowX: 0, flowY: 0, createdAt: 1, updatedAt: 1 };
    useAppStore.setState({
      sceneRecordsByStory: { 'story-1': { 'scene-1': record } },
      storiesMetadata: [{ id: 'story-1', title: 'Story', startSceneId: 'scene-1', sceneOrder: ['scene-1'], tags: [], theme: {}, createdAt: 1, updatedAt: 1, sceneCount: 1 }],
    });
    const change: AiChatAppliedChange = {
      kind: 'appearance',
      storyId: 'story-1',
      previousTheme: undefined,
      appliedAt: 1,
      label: 'theme',
      postRevisions: capturePostRevisions('story-1', { scope: 'appearance' }),
    };
    useAppStore.getState().sceneRecordsByStory['story-1']['scene-1'].name = 'Manual';
    expect(hasNewerEdits(change)).toBe(false);
    useAppStore.getState().storiesMetadata[0].theme = { dialogueBg: '#000000' };
    expect(hasNewerEdits(change)).toBe(true);
  });

  it('persists the journal and prunes entries whose snapshot is missing', async () => {
    useAppStore.setState({
      isLoaded: true,
      storiesMetadata: [{ id: 'story-1' } as never],
    });
    const appearance: AiChatAppliedChange = {
      kind: 'appearance',
      storyId: 'story-1',
      previousTheme: undefined,
      appliedAt: 2,
      label: 'appearance',
      postRevisions: { appearance: 'after' },
    };
    const storage = useAiChatStore.persist.getOptions().storage;
    await storage?.setItem('vne-ai-chat', {
      state: {
        messagesByStory: {},
        appliedChangesByStory: { 'story-1': [entry(1), appearance] },
      },
      version: 1,
    });
    await useAiChatStore.persist.rehydrate();
    await reconcileAppliedChanges();
    expect(useAiChatStore.getState().appliedChangesByStory['story-1']).toEqual([appearance]);
    await useAiChatStore.persist.clearStorage();
  });
});
