import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
import { makeEnvelope } from '@/lib/bridge-protocol';

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
    pendingInteraction: null,
    appliedChangesByStory: {},
    appliedChanges: [],
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
    useAppStore.setState({
      updateAiBridgeSettings: partial => useAppStore.setState(state => ({
        aiBridgeSettings: { ...state.aiBridgeSettings, ...partial },
      })),
    });
  });

  it('rebuilds the bridge client when runtime connection settings change', async () => {
    class SocketMock {
      static instances: SocketMock[] = [];
      static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSED = 3;
      readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSED = 3;
      readyState = 0; onopen = null; onmessage = null; onerror = null; onclose = null;
      close = vi.fn(() => { this.readyState = 3; }); send = vi.fn();
      constructor(readonly url: string) { SocketMock.instances.push(this); }
    }
    vi.stubGlobal('WebSocket', SocketMock);
    useAppStore.setState({ aiBridgeSettings: { url: 'ws://localhost:8787', token: 'first', disabled: false } });
    const view = render(<AiChatPanel storyId="story-1" activeSceneId={null} />);
    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
    expect(SocketMock.instances[0].url).toBe('ws://localhost:8787');
    view.rerender(<AiChatPanel storyId="story-1" activeSceneId="scene-1" />);
    await act(async () => {});
    expect(SocketMock.instances).toHaveLength(1);
    act(() => useAppStore.setState({ aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'second', disabled: false } }));
    view.rerender(<AiChatPanel storyId="story-1" activeSceneId={null} />);
    await waitFor(() => expect(SocketMock.instances).toHaveLength(2));
    expect(SocketMock.instances[0].close).toHaveBeenCalled();
    expect(SocketMock.instances[1].url).toBe('ws://127.0.0.1:8787');
    view.unmount();
    useAppStore.setState({ aiBridgeSettings: { url: '', token: '', disabled: false } });
    vi.unstubAllGlobals();
  });

  it('disconnects, reconnects, and fully resets a connected bridge', async () => {
    class SocketMock {
      static instances: SocketMock[] = [];
      static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSED = 3;
      readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSED = 3;
      readyState = 0;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror = null;
      onclose: (() => void) | null = null;
      close = vi.fn(() => { this.readyState = 3; this.onclose?.(); });
      send = vi.fn();
      constructor(readonly url: string) { SocketMock.instances.push(this); }
      start(sessionId: string) {
        this.readyState = 1;
        this.onopen?.(new Event('open'));
        this.onmessage?.({ data: JSON.stringify(makeEnvelope('session_started', { sessionId, provider: 'codex' }, sessionId)) } as MessageEvent<string>);
      }
      emitError(sessionId: string, reason: string, message: string) {
        this.onmessage?.({
          data: JSON.stringify(makeEnvelope('error', {
            code: 'PROVIDER_UNAVAILABLE',
            message,
            details: { reason },
          }, sessionId)),
        } as MessageEvent<string>);
      }
    }
    vi.stubGlobal('WebSocket', SocketMock);
    useAppStore.setState({ aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'runtime-token', disabled: false } });
    const view = render(<AiChatPanel storyId="story-1" activeSceneId={null} />);
    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
    act(() => SocketMock.instances[0].start('session-1'));
    await waitFor(() => expect(screen.getByText(/Connected.*Codex/)).toBeTruthy());

    act(() => SocketMock.instances[0].emitError('session-1', 'TURN_ALREADY_RUNNING', 'A turn is already running'));
    expect(screen.getByText(/still working on the previous request/)).toBeTruthy();
    expect(JSON.stringify(useAiChatStore.getState().messagesByStory)).not.toContain('A turn is already running');

    fireEvent.click(screen.getByRole('button', { name: 'AI settings' }));
    expect(screen.getByText('Provider status')).toBeTruthy();
    expect(screen.getByText('Attachments and privacy')).toBeTruthy();
    expect(screen.getByText('Danger zone')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(useAppStore.getState().aiBridgeSettings).toEqual({
      url: 'ws://127.0.0.1:8787',
      token: 'runtime-token',
      disabled: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => expect(SocketMock.instances).toHaveLength(2));
    act(() => SocketMock.instances[1].start('session-2'));

    fireEvent.click(screen.getByRole('button', { name: 'Reset connection' }));
    expect(useAppStore.getState().aiBridgeSettings).toEqual({ url: '', token: '', disabled: true, preferredProvider: 'openai', codexBetaConsent: undefined });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect real AI' })).toBeTruthy());

    view.unmount();
    vi.unstubAllGlobals();
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
    useAiChatStore.setState({
      pendingInteraction: { kind: 'scene_patch', storyId: record.storyId, value: { patch, description } },
    });

    render(<AiChatPanel storyId={record.storyId} activeSceneId={record.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalledWith(expect.objectContaining({ name: 'After' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo AI changes' })).toBeTruthy());

    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
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
    useAiChatStore.setState({
      pendingInteraction: { kind: 'scene_patch', storyId: record.storyId, value: { patch, description } },
    });

    render(<AiChatPanel storyId={record.storyId} activeSceneId={record.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(screen.getByText(/Ask the assistant again/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Undo AI changes' })).toBeNull();
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
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
    useAiChatStore.setState({
      pendingInteraction: { kind: 'appearance', storyId: metadata.id, value: { patch, description } },
    });

    render(<AiChatPanel storyId={metadata.id} activeSceneId={record.id} />);
    expect(screen.getByText('Reader appearance')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(updateStoryMetadata).toHaveBeenCalledWith('story-1', { theme: { dialogueBg: '#000000' } }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo AI changes' })).toBeTruthy());

    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
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
    useAiChatStore.setState({
      pendingInteraction: { kind: 'scene_patch', storyId: record.storyId, value: { patch, description } },
    });

    render(<AiChatPanel storyId={record.storyId} activeSceneId={record.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    expect(saveSceneRecord).not.toHaveBeenCalled();
    expect(createStorySnapshot).not.toHaveBeenCalled();
  });
});
