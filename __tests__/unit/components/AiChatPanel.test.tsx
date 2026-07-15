import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AiChatPanel } from '@/components/ai-chat/AiChatPanel';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { describeAiScenePatch } from '@/lib/ai/scene-patch';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import {
  computeAppearanceRevision,
  describeAiAppearancePatch,
  type AiReaderAppearancePatch,
} from '@/lib/ai/appearance-patch';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { useAppStore } from '@/stores/use-app-store';

function scene(): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Before',
    description: '',
    tags: [],
    timeline: [],
    sceneState: {
      backgroundAssetId: null,
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      musicTrackId: null,
      musicPlaying: false,
      musicVolume: 1,
      variables: {},
      dialogueHistory: [],
      currentChoices: null,
      isTransitioning: false,
      transitionTarget: null,
    },
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function buildPatch(record: SceneRecord): AiScenePatch {
  return {
    storyId: record.storyId,
    sceneId: record.id,
    expectedRevision: computeSceneRevision(record),
    explanation: "Rewrite the active scene's dialogue",
    operations: [{ op: 'update_scene_metadata', updates: { name: 'After' } }],
  };
}

function resetChatStore() {
  useAiChatStore.setState({
    messages: [],
    status: 'idle',
    pendingPatch: null,
    pendingAppearance: null,
    lastAppliedChange: null,
  });
}

function storyMetadata(theme?: StoryMetadata['theme']): StoryMetadata {
  return { id: 'story-1', title: 'Story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 1, theme };
}

function buildAppearancePatch(metadata: StoryMetadata): AiReaderAppearancePatch {
  return {
    storyId: metadata.id,
    expectedRevision: computeAppearanceRevision(metadata),
    theme: { dialogueBg: '#000000' },
    explanation: 'Darken the dialogue box',
  };
}

describe('AiChatPanel', () => {
  beforeEach(() => {
    resetChatStore();
  });

  it('applies the pending patch, saves the record, and shows a rollback control', async () => {
    const record = scene();
    const patch = buildPatch(record);
    const description = describeAiScenePatch(record, patch);
    const createStorySnapshot = vi.fn(async () => ({ id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true }));
    const saveSceneRecord = vi.fn();
    useAppStore.setState({
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot,
      saveSceneRecord,
    });
    useAiChatStore.setState({ pendingPatch: { patch, description } });

    render(<AiChatPanel storyId={record.storyId} activeSceneId={record.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalledWith(expect.objectContaining({ name: 'After' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo AI changes' })).toBeTruthy());

    expect(useAiChatStore.getState().pendingPatch).toBeNull();
    expect(useAiChatStore.getState().lastAppliedChange).toEqual({
      kind: 'scene',
      storyId: record.storyId,
      snapshotId: 'snap-1',
    });
  });

  it('shows a clear error and no rollback control when the revision has gone stale', async () => {
    const record = scene();
    const patch = buildPatch(record);
    patch.expectedRevision = 'stale-revision';
    const description = describeAiScenePatch(record, patch);
    const saveSceneRecord = vi.fn();
    useAppStore.setState({
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot: vi.fn(),
      saveSceneRecord,
    });
    useAiChatStore.setState({ pendingPatch: { patch, description } });

    render(<AiChatPanel storyId={record.storyId} activeSceneId={record.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(screen.getByText(/Ask the assistant again/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Undo AI changes' })).toBeNull();
    expect(useAiChatStore.getState().pendingPatch).toBeNull();
    expect(saveSceneRecord).not.toHaveBeenCalled();
  });

  it('applies a pending appearance patch through the theme adapter', async () => {
    const record = scene();
    const metadata = storyMetadata({ dialogueBg: '#ffffff' });
    const patch = buildAppearancePatch(metadata);
    const description = describeAiAppearancePatch(metadata, patch);
    const updateStoryMetadata = vi.fn();
    useAppStore.setState({
      storiesMetadata: [metadata],
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot: vi.fn(),
      updateStoryMetadata,
    });
    useAiChatStore.setState({ pendingAppearance: { patch, description } });

    render(<AiChatPanel storyId={metadata.id} activeSceneId={record.id} />);
    expect(screen.getByText('Reader appearance')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(updateStoryMetadata).toHaveBeenCalledWith('story-1', { theme: { dialogueBg: '#000000' } }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo AI changes' })).toBeTruthy());

    expect(useAiChatStore.getState().pendingAppearance).toBeNull();
    expect(useAiChatStore.getState().lastAppliedChange).toEqual({
      kind: 'appearance',
      storyId: 'story-1',
      previousTheme: { dialogueBg: '#ffffff' },
    });
  });

  it('undoing an applied theme writes the previous colors back', async () => {
    const record = scene();
    const metadata = storyMetadata({ dialogueBg: '#ffffff' });
    const updateStoryMetadata = vi.fn();
    useAppStore.setState({
      storiesMetadata: [metadata],
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      updateStoryMetadata,
    });
    useAiChatStore.setState({
      lastAppliedChange: { kind: 'appearance', storyId: 'story-1', previousTheme: { dialogueBg: '#ffffff' } },
    });

    render(<AiChatPanel storyId={metadata.id} activeSceneId={record.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo AI changes' }));

    await waitFor(() =>
      expect(updateStoryMetadata).toHaveBeenCalledWith('story-1', { theme: { dialogueBg: '#ffffff' } }),
    );
    await waitFor(() => expect(useAiChatStore.getState().lastAppliedChange).toBeNull());
  });

  it('rejecting clears the pending patch without touching the store', () => {
    const record = scene();
    const patch = buildPatch(record);
    const description = describeAiScenePatch(record, patch);
    const saveSceneRecord = vi.fn();
    const createStorySnapshot = vi.fn();
    useAppStore.setState({
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot,
      saveSceneRecord,
    });
    useAiChatStore.setState({ pendingPatch: { patch, description } });

    render(<AiChatPanel storyId={record.storyId} activeSceneId={record.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(useAiChatStore.getState().pendingPatch).toBeNull();
    expect(saveSceneRecord).not.toHaveBeenCalled();
    expect(createStorySnapshot).not.toHaveBeenCalled();
  });
});
