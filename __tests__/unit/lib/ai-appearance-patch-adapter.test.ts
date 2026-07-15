import { computeAppearanceRevision, type AiReaderAppearancePatch } from '@/lib/ai/appearance-patch';
import { applyAiAppearancePatchToStore, rollbackAiAppearancePatch } from '@/lib/ai/appearance-patch-adapter';
import type { StoryMetadata } from '@/lib/story-domain';
import { useAppStore } from '@/stores/use-app-store';

function story(theme?: StoryMetadata['theme']): StoryMetadata {
  return { id: 'story-1', title: 'Story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 1, theme };
}

function patch(metadata: StoryMetadata, overrides: Partial<AiReaderAppearancePatch> = {}): AiReaderAppearancePatch {
  return {
    storyId: metadata.id,
    expectedRevision: computeAppearanceRevision(metadata),
    theme: { dialogueBg: '#000000' },
    explanation: 'Darken the dialogue box',
    ...overrides,
  };
}

describe('appearance patch store adapter', () => {
  beforeEach(() => useAppStore.setState({ storiesMetadata: [] }));

  it('writes the merged theme and returns the previous one for rollback', async () => {
    const metadata = story({ dialogueBg: '#ffffff', nameText: '#abcdef' });
    const updateStoryMetadata = vi.fn();
    useAppStore.setState({ storiesMetadata: [metadata], createStorySnapshot: vi.fn(), updateStoryMetadata });

    const result = await applyAiAppearancePatchToStore(patch(metadata));

    expect(result).toMatchObject({ ok: true, previousTheme: { dialogueBg: '#ffffff', nameText: '#abcdef' } });
    expect(updateStoryMetadata).toHaveBeenCalledWith('story-1', {
      theme: { dialogueBg: '#000000', nameText: '#abcdef' },
    });
  });

  // A story snapshot stores scenes plus {title, startSceneId, sceneOrder, tags} and
  // restore only writes scenes back — it can never revert a theme. Taking one here
  // would hand the user a snapshot that silently fails to undo the color change.
  it('does not take a story snapshot, which cannot carry a theme', async () => {
    const metadata = story({ dialogueBg: '#ffffff' });
    const createStorySnapshot = vi.fn();
    useAppStore.setState({ storiesMetadata: [metadata], createStorySnapshot, updateStoryMetadata: vi.fn() });

    await applyAiAppearancePatchToStore(patch(metadata));

    expect(createStorySnapshot).not.toHaveBeenCalled();
  });

  it('rolls back by restoring the exact previous theme', () => {
    const metadata = story({ dialogueBg: '#ffffff' });
    const updateStoryMetadata = vi.fn();
    useAppStore.setState({ storiesMetadata: [metadata], updateStoryMetadata });

    expect(rollbackAiAppearancePatch('story-1', { dialogueBg: '#ffffff' })).toBe(true);
    expect(updateStoryMetadata).toHaveBeenCalledWith('story-1', { theme: { dialogueBg: '#ffffff' } });
  });

  it('rolls back to no theme at all when the story had none', () => {
    const metadata = story();
    const updateStoryMetadata = vi.fn();
    useAppStore.setState({ storiesMetadata: [metadata], updateStoryMetadata });

    expect(rollbackAiAppearancePatch('story-1', undefined)).toBe(true);
    expect(updateStoryMetadata).toHaveBeenCalledWith('story-1', { theme: undefined });
  });

  it('leaves the store untouched when the revision is stale', async () => {
    const metadata = story({ dialogueBg: '#ffffff' });
    const updateStoryMetadata = vi.fn();
    useAppStore.setState({ storiesMetadata: [metadata], createStorySnapshot: vi.fn(), updateStoryMetadata });

    const result = await applyAiAppearancePatchToStore(patch(metadata, { expectedRevision: 'stale' }));

    expect(result).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    expect(updateStoryMetadata).not.toHaveBeenCalled();
  });

  it('leaves the store untouched for an invalid patch', async () => {
    const metadata = story();
    const updateStoryMetadata = vi.fn();
    useAppStore.setState({ storiesMetadata: [metadata], createStorySnapshot: vi.fn(), updateStoryMetadata });

    const result = await applyAiAppearancePatchToStore(patch(metadata, { theme: { dialogueBg: 'not-a-color' } as never }));

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(updateStoryMetadata).not.toHaveBeenCalled();
  });

  it('reports a missing story', async () => {
    useAppStore.setState({ storiesMetadata: [], createStorySnapshot: vi.fn(), updateStoryMetadata: vi.fn() });
    const result = await applyAiAppearancePatchToStore(patch(story()));
    expect(result).toMatchObject({ ok: false, code: 'STORY_NOT_FOUND' });
  });

  it('refuses to roll back a story that no longer exists', () => {
    const updateStoryMetadata = vi.fn();
    useAppStore.setState({ storiesMetadata: [], updateStoryMetadata });

    expect(rollbackAiAppearancePatch('story-1', undefined)).toBe(false);
    expect(updateStoryMetadata).not.toHaveBeenCalled();
  });
});
