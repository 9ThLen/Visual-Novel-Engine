import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { computeSceneRevision } from '@/lib/ai/scene-revision';
import type { SceneRecord } from '@/lib/engine/types';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';

import { AiChatPanel, executeProposeChangeSet } from '@/components/ai-chat/AiChatPanel';

function scene(): SceneRecord {
  return {
    id: 'scene-1', storyId: 'story-1', name: 'Start', description: '', tags: [], timeline: [],
    sceneState: { backgroundAssetId: null, backgroundTransition: 'fade', characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: {}, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null },
    flowX: 0, flowY: 0, connections: [], isStart: true, createdAt: 1, updatedAt: 1,
  };
}

describe('AiChatPanel changeset tool', () => {
  beforeEach(() => {
    const record = scene();
    useAppStore.setState({
      storiesMetadata: [{ id: 'story-1', title: 'Story', startSceneId: 'scene-1', sceneOrder: ['scene-1'], createdAt: 1, updatedAt: 1, sceneCount: 1 }],
      sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [],
    });
    useAiChatStore.setState({ messages: [], status: 'idle', pendingPatch: null, pendingAppearance: null, pendingChangeSet: null, appliedChanges: [], lastAppliedChange: null });
  });

  it('round-trips a proposal through pending, apply, and the journal', async () => {
    const commitAiChangeSet = vi.fn();
    useAppStore.setState({
      createStorySnapshot: vi.fn(async () => ({ id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true })),
      commitAiChangeSet,
    });
    const proposal = {
      storyId: 'story-1', expectedSceneRevisions: {}, explanation: 'Add a branch',
      items: [{ kind: 'create_scene', tempId: 'new:branch', afterRef: 'scene-1', name: 'Branch', timeline: [] }],
    };
    const resultPromise = executeProposeChangeSet('story-1', proposal, useAiChatStore.getState().setPendingChangeSet, async () => ({ accepted: true }));

    expect(useAiChatStore.getState().pendingChangeSet?.changeSet).toEqual(proposal);
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await expect(resultPromise).resolves.toMatchObject({ ok: true, result: { accepted: true } });
    await waitFor(() => expect(commitAiChangeSet).toHaveBeenCalled());
    expect(useAiChatStore.getState().appliedChanges.at(-1)).toMatchObject({ kind: 'changeset', snapshotId: 'snap-1' });
  });

  it('maps ITEM_ORDER to a structured wire validation error', async () => {
    const result = await executeProposeChangeSet('story-1', {
      storyId: 'story-1', expectedSceneRevisions: {}, expectedCharacterRevision: 'revision', explanation: 'Bad order',
      items: [
        { kind: 'create_scene', tempId: 'new:branch', afterRef: 'scene-1', name: 'Branch', timeline: [] },
        { kind: 'create_character', character: { tempId: 'newchar:hero', name: 'Hero' } },
      ],
    }, useAiChatStore.getState().setPendingChangeSet, async () => ({ accepted: true }));
    expect(result).toMatchObject({ ok: false, errorCode: 'VALIDATION_FAILED', details: { reason: 'ITEM_ORDER' } });
  });

  it('passes STALE_REVISION through unchanged', async () => {
    const record = scene();
    const result = await executeProposeChangeSet('story-1', {
      storyId: 'story-1', expectedSceneRevisions: { 'scene-1': `${computeSceneRevision(record)}-stale` }, explanation: 'Rename',
      items: [{ kind: 'patch_scene', sceneRef: 'scene-1', operations: [{ op: 'update_scene_metadata', updates: { name: 'New' } }] }],
    }, useAiChatStore.getState().setPendingChangeSet, async () => ({ accepted: true }));
    expect(result).toMatchObject({ ok: false, errorCode: 'STALE_REVISION' });
    expect(result).not.toHaveProperty('details.reason');
  });
});
