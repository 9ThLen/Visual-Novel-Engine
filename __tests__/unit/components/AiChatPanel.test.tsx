import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AiChatPanel } from '@/components/ai-chat/AiChatPanel';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { describeAiScenePatch } from '@/lib/ai/scene-patch';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import type { SceneRecord } from '@/lib/engine/types';
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
  useAiChatStore.setState({ messages: [], status: 'idle', pendingPatch: null, lastAppliedSnapshot: null });
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
    expect(useAiChatStore.getState().lastAppliedSnapshot).toEqual({ storyId: record.storyId, snapshotId: 'snap-1' });
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
