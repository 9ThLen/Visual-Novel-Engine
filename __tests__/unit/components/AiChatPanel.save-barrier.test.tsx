/**
 * The save barrier: the document editor's draft must land in the store before
 * any AI mutation runs. Without it every revision guard (`hasNewerEdits`,
 * `STALE_REVISION`) compares against a story state the author has already moved
 * past, and the editor's next save writes the stale document back over the
 * result.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AiChatPanel, executeProposeChangeSet } from '@/components/ai-chat/AiChatPanel';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { describeAiScenePatch } from '@/lib/ai/scene-patch';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import type { SceneRecord } from '@/lib/engine/types';
import { useAiChatStore } from '@/stores/ai-chat-store';
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
    explanation: 'Rename the scene',
    operations: [{ op: 'update_scene_metadata', updates: { name: 'After' } }],
  };
}

function seedPendingPatch(record: SceneRecord, saveSceneRecord: ReturnType<typeof vi.fn>) {
  const patch = buildPatch(record);
  useAppStore.setState({
    sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
    characterLibraries: {},
    imageAssetIdsByStory: {},
    mediaLibrary: [],
    createStorySnapshot: vi.fn().mockResolvedValue('snap-1'),
    saveSceneRecord,
  });
  useAiChatStore.setState({
    pendingInteraction: {
      kind: 'scene_patch',
      storyId: record.storyId,
      value: { patch, description: describeAiScenePatch(record, patch) },
    },
  });
}

describe('AiChatPanel save barrier', () => {
  beforeEach(() => {
    useAiChatStore.setState({
      // messagesByStory is what the panel renders; resetting only the compat
      // `messages` view leaks system messages between tests.
      messagesByStory: {},
      messages: [],
      status: 'idle',
      pendingInteraction: null,
      appliedChangesByStory: {},
      appliedChanges: [],
      lastAppliedChange: null,
    });
  });

  it('runs the barrier before applying a scene patch', async () => {
    const record = scene();
    const order: string[] = [];
    const saveSceneRecord = vi.fn(() => { order.push('mutate'); });
    seedPendingPatch(record, saveSceneRecord);
    const beforeStoryMutation = vi.fn(async () => { order.push('barrier'); return true; });

    render(
      <AiChatPanel
        storyId={record.storyId}
        activeSceneId={record.id}
        beforeStoryMutation={beforeStoryMutation}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalled());
    expect(order).toEqual(['barrier', 'mutate']);
  });

  it('does not mutate when the barrier reports the draft did not save', async () => {
    const record = scene();
    const saveSceneRecord = vi.fn();
    seedPendingPatch(record, saveSceneRecord);
    const beforeStoryMutation = vi.fn(async () => false);

    render(
      <AiChatPanel
        storyId={record.storyId}
        activeSceneId={record.id}
        beforeStoryMutation={beforeStoryMutation}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(beforeStoryMutation).toHaveBeenCalled());
    expect(saveSceneRecord).not.toHaveBeenCalled();
    // The proposal stays on screen so the author can retry after saving.
    expect(useAiChatStore.getState().pendingInteraction).not.toBeNull();
    await waitFor(() => expect(screen.getByText(/Could not save the open document/)).toBeTruthy());
  });

  it('runs the barrier before a rollback', async () => {
    const record = scene();
    const order: string[] = [];
    const restoreStorySnapshot = vi.fn(async () => { order.push('mutate'); return true; });
    useAppStore.setState({
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      restoreStorySnapshot,
    });
    useAiChatStore.setState({
      lastAppliedChange: { kind: 'scene', storyId: record.storyId, snapshotId: 'snap-1' },
    });
    const beforeStoryMutation = vi.fn(async () => { order.push('barrier'); return true; });

    render(
      <AiChatPanel
        storyId={record.storyId}
        activeSceneId={record.id}
        beforeStoryMutation={beforeStoryMutation}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo AI changes' }));

    await waitFor(() => expect(restoreStorySnapshot).toHaveBeenCalled());
    expect(order).toEqual(['barrier', 'mutate']);
  });

  it('does not roll back when the barrier fails', async () => {
    const record = scene();
    const restoreStorySnapshot = vi.fn(async () => true);
    useAppStore.setState({
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      restoreStorySnapshot,
    });
    useAiChatStore.setState({
      lastAppliedChange: { kind: 'scene', storyId: record.storyId, snapshotId: 'snap-1' },
    });

    render(
      <AiChatPanel
        storyId={record.storyId}
        activeSceneId={record.id}
        beforeStoryMutation={async () => false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo AI changes' }));

    await waitFor(() => expect(screen.getByText(/Could not save the open document/)).toBeTruthy());
    expect(restoreStorySnapshot).not.toHaveBeenCalled();
  });
  // hasNewerEdits refuses the first attempt when the story moved on; the author
  // then confirms. The barrier has to run again — they could have typed between
  // the refusal and the confirmation.
  it('runs the barrier again on the forced rollback retry', async () => {
    const record = scene();
    const restoreStorySnapshot = vi.fn(async () => true);
    useAppStore.setState({
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      storiesMetadata: [],
      restoreStorySnapshot,
    });
    useAiChatStore.setState({
      lastAppliedChange: { kind: 'scene', storyId: record.storyId, snapshotId: 'snap-1' },
      appliedChangesByStory: {
        [record.storyId]: [{
          kind: 'scene',
          storyId: record.storyId,
          snapshotId: 'snap-1',
          appliedAt: 1,
          label: 'Rename',
          // Does not match the live story, so the first attempt asks to confirm.
          postRevisions: { scenes: { [record.id]: 'stale-revision' } },
        }],
      },
    });
    const beforeStoryMutation = vi.fn(async () => true);

    render(
      <AiChatPanel
        storyId={record.storyId}
        activeSceneId={record.id}
        beforeStoryMutation={beforeStoryMutation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo AI changes' }));
    await waitFor(() => expect(screen.getByText(/Newer manual work/)).toBeTruthy());
    expect(beforeStoryMutation).toHaveBeenCalledTimes(1);
    expect(restoreStorySnapshot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Undo anyway' }));

    await waitFor(() => expect(restoreStorySnapshot).toHaveBeenCalled());
    expect(beforeStoryMutation).toHaveBeenCalledTimes(2);
  });

  it('does not force a rollback when the barrier fails on the retry', async () => {
    const record = scene();
    const restoreStorySnapshot = vi.fn(async () => true);
    useAppStore.setState({
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      storiesMetadata: [],
      restoreStorySnapshot,
    });
    useAiChatStore.setState({
      lastAppliedChange: { kind: 'scene', storyId: record.storyId, snapshotId: 'snap-1' },
      appliedChangesByStory: {
        [record.storyId]: [{
          kind: 'scene',
          storyId: record.storyId,
          snapshotId: 'snap-1',
          appliedAt: 1,
          label: 'Rename',
          postRevisions: { scenes: { [record.id]: 'stale-revision' } },
        }],
      },
    });
    // Saves on the first call, fails on the confirmation retry.
    const beforeStoryMutation = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    render(
      <AiChatPanel
        storyId={record.storyId}
        activeSceneId={record.id}
        beforeStoryMutation={beforeStoryMutation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo AI changes' }));
    await waitFor(() => expect(screen.getByText(/Newer manual work/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Undo anyway' }));

    await waitFor(() => expect(beforeStoryMutation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(/Could not save the open document/)).toBeTruthy());
    expect(restoreStorySnapshot).not.toHaveBeenCalled();
  });
  it('runs the barrier before applying a change set', async () => {
    const record = scene();
    const order: string[] = [];
    const commitAiChangeSet = vi.fn(() => { order.push('mutate'); });
    useAppStore.setState({
      storiesMetadata: [{ id: 'story-1', title: 'Story', startSceneId: 'scene-1', sceneOrder: ['scene-1'], createdAt: 1, updatedAt: 1, sceneCount: 1 }],
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot: vi.fn(async () => ({ id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true })),
      commitAiChangeSet,
    });
    void executeProposeChangeSet(
      'story-1',
      {
        storyId: 'story-1',
        expectedSceneRevisions: {},
        explanation: 'Add a branch',
        items: [{ kind: 'create_scene', tempId: 'new:branch', afterRef: 'scene-1', name: 'Branch', timeline: [] }],
      },
      (value) => useAiChatStore.getState().setPendingInteraction({ kind: 'changeset', storyId: 'story-1', value }),
      async () => ({ accepted: true }),
    );
    const beforeStoryMutation = vi.fn(async () => { order.push('barrier'); return true; });

    render(
      <AiChatPanel storyId="story-1" activeSceneId={record.id} beforeStoryMutation={beforeStoryMutation} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(commitAiChangeSet).toHaveBeenCalled());
    expect(order).toEqual(['barrier', 'mutate']);
  });

  // The barrier is awaited before any state update lands, so `applying` cannot
  // be what gates the button: for the whole flush it is still false.
  it('applies once when the button is clicked twice during the barrier', async () => {
    const record = scene();
    const saveSceneRecord = vi.fn();
    seedPendingPatch(record, saveSceneRecord);
    let releaseBarrier: (() => void) | undefined;
    const beforeStoryMutation = vi.fn(() => new Promise<boolean>((resolve) => {
      releaseBarrier = () => resolve(true);
    }));

    render(
      <AiChatPanel
        storyId={record.storyId}
        activeSceneId={record.id}
        beforeStoryMutation={beforeStoryMutation}
      />,
    );
    const apply = screen.getByRole('button', { name: 'Apply' });
    fireEvent.click(apply);
    fireEvent.click(apply);
    await waitFor(() => expect(beforeStoryMutation).toHaveBeenCalled());
    releaseBarrier?.();

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalled());
    expect(beforeStoryMutation).toHaveBeenCalledTimes(1);
    expect(saveSceneRecord).toHaveBeenCalledTimes(1);
  });

  it('rolls back once when undo is clicked twice during the barrier', async () => {
    const record = scene();
    const restoreStorySnapshot = vi.fn(async () => true);
    useAppStore.setState({
      sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      restoreStorySnapshot,
    });
    useAiChatStore.setState({
      lastAppliedChange: { kind: 'scene', storyId: record.storyId, snapshotId: 'snap-1' },
    });
    let releaseBarrier: (() => void) | undefined;
    const beforeStoryMutation = vi.fn(() => new Promise<boolean>((resolve) => {
      releaseBarrier = () => resolve(true);
    }));

    render(
      <AiChatPanel
        storyId={record.storyId}
        activeSceneId={record.id}
        beforeStoryMutation={beforeStoryMutation}
      />,
    );
    const undo = screen.getByRole('button', { name: 'Undo AI changes' });
    fireEvent.click(undo);
    fireEvent.click(undo);
    await waitFor(() => expect(beforeStoryMutation).toHaveBeenCalled());
    releaseBarrier?.();

    await waitFor(() => expect(restoreStorySnapshot).toHaveBeenCalled());
    expect(restoreStorySnapshot).toHaveBeenCalledTimes(1);
  });
  // `applying` used to be set only after the barrier resolved, leaving Reject
  // live for the whole flush: rejecting then resolved the decision while the
  // apply was still in flight, and the patch landed anyway.
  it('disables the decision buttons for the whole barrier, not just the apply', async () => {
    const record = scene();
    const saveSceneRecord = vi.fn();
    seedPendingPatch(record, saveSceneRecord);
    let releaseBarrier: (() => void) | undefined;
    const beforeStoryMutation = vi.fn(() => new Promise<boolean>((resolve) => {
      releaseBarrier = () => resolve(true);
    }));

    render(
      <AiChatPanel
        storyId={record.storyId}
        activeSceneId={record.id}
        beforeStoryMutation={beforeStoryMutation}
      />,
    );
    const reject = screen.getByRole('button', { name: 'Reject' });
    expect(reject.hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.getByRole('button', { name: 'Reject' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(beforeStoryMutation).toHaveBeenCalled());
    releaseBarrier?.();

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalled());
    expect(screen.queryByText('Changes rejected.')).toBeNull();
  });
});
