/**
 * A proposal on screen belongs to a bridge call, and that call can end without
 * the author: the bridge withdraws it, or its time runs out. The card has to go
 * then, and nothing may be written for it — not even by an Apply that was
 * already waiting for the open document to be saved.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AiChatPanel } from '@/components/ai-chat/AiChatPanel';
import { normalizeAiPermissions } from '@/lib/ai/permissions';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { makeEnvelope, type BridgeEnvelope } from '@/lib/bridge-protocol';
import { createTextStep } from '@/lib/engine/event-factory';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';

function scene(): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Library',
    description: '',
    tags: [],
    timeline: [{ ...createTextStep({ content: 'Дощ почався.' }), id: 'step_rain' }],
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

const metadata: StoryMetadata = { id: 'story-1', title: 'Story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 1 };

function patchFor(record: SceneRecord): AiScenePatch {
  return {
    storyId: record.storyId,
    sceneId: record.id,
    expectedRevision: computeSceneRevision(record),
    explanation: 'Describe the scene',
    operations: [{ op: 'update_scene_metadata', updates: { description: 'Written by the assistant' } }],
  };
}

/** A story whose writes can be watched, and a bridge that has accepted the session. */
function setup(record: SceneRecord) {
  const saveSceneRecord = vi.fn();
  useAppStore.setState({
    storiesMetadata: [metadata],
    sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
    characterLibraries: {},
    imageAssetIdsByStory: {},
    mediaLibrary: [],
    createStorySnapshot: vi.fn(async () => ({ id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true })),
    saveSceneRecord,
    aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'token', disabled: false },
  });

  class SocketMock {
    static instances: SocketMock[] = [];
    static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSED = 3;
    readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSED = 3;
    readyState = 0;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent<string>) => void) | null = null;
    onerror = null;
    onclose = null;
    close = vi.fn(() => { this.readyState = 3; });
    send = vi.fn();
    constructor() { SocketMock.instances.push(this); }
    receive(type: Parameters<typeof makeEnvelope>[0], payload: unknown) {
      this.onmessage?.({ data: JSON.stringify(makeEnvelope(type, payload, 'session-1')) } as MessageEvent<string>);
    }
    results(): Record<string, unknown>[] {
      return this.send.mock.calls
        .map(([raw]) => JSON.parse(raw as string) as BridgeEnvelope)
        .filter(envelope => envelope.type === 'tool_result')
        .map(envelope => envelope.payload as Record<string, unknown>);
    }
  }
  vi.stubGlobal('WebSocket', SocketMock);

  return {
    saveSceneRecord,
    async open() {
      await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
      const socket = SocketMock.instances[0];
      act(() => {
        socket.readyState = 1;
        socket.onopen?.(new Event('open'));
        socket.receive('session_started', {
          sessionId: 'session-1',
          provider: 'openai',
          capabilities: { chat: { supported: true }, attachments: { supported: false, kinds: [], maxCount: 4, maxDecodedBytes: 5 * 1024 * 1024 } },
        });
      });
      await waitFor(() => expect(screen.getAllByText(/^Connected/).length).toBeGreaterThan(0));
      return socket;
    },
  };
}

type Socket = Awaited<ReturnType<ReturnType<typeof setup>['open']>>;

async function proposeTo(socket: Socket, record: SceneRecord, ttlMs = 600_000) {
  act(() => socket.receive('tool_call', { toolCallId: 'call-1', toolName: 'propose_scene_patch', input: { patch: patchFor(record) }, origin: 'chat', ttlMs }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy());
}

/** A save barrier that stays shut until the test opens it. */
function heldBarrier() {
  let open!: (saved: boolean) => void;
  const barrier = vi.fn(() => new Promise<boolean>((resolve) => { open = resolve; }));
  return { barrier, open: (saved = true) => act(async () => { open(saved); await Promise.resolve(); }) };
}

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });

/**
 * A card's lifetime for a test that presses Apply before it is up and lets
 * it run out while the document is being saved. At 80 ms a loaded machine
 * did not get to the button in time.
 */
const CLICKABLE_TTL_MS = 600;

describe('AiChatPanel and the life of a proposal', () => {
  beforeEach(() => {
    useAiChatStore.setState({
      messagesByStory: {},
      messages: [],
      status: 'idle',
      pendingInteraction: null,
      appliedChangesByStory: {},
      appliedChanges: [],
      lastAppliedChange: null,
    });
    useAppStore.setState(state => ({ settings: { ...state.settings, aiPermissions: normalizeAiPermissions(undefined) } }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState(state => ({
      aiBridgeSettings: { url: '', token: '', disabled: false },
      settings: { ...state.settings, aiPermissions: normalizeAiPermissions(undefined) },
    }));
  });

  it('takes the card down when the bridge withdraws the call, and answers nothing', async () => {
    const record = scene();
    const story = setup(record);
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} />);
    const socket = await story.open();
    await proposeTo(socket, record);

    act(() => socket.receive('tool_cancel', { toolCallId: 'call-1', reason: 'TURN_ENDED' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull());
    expect(screen.getByText(/withdrew this proposal/)).toBeTruthy();
    await settle();
    expect(socket.results()).toEqual([]);
    expect(story.saveSceneRecord).not.toHaveBeenCalled();
  });

  it('leaves the card alone when another call is withdrawn', async () => {
    const record = scene();
    const story = setup(record);
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} />);
    const socket = await story.open();
    await proposeTo(socket, record);

    act(() => socket.receive('tool_cancel', { toolCallId: 'call-0', reason: 'TURN_ENDED' }));
    await settle();

    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
  });

  it('takes the card down when its time is up, and says so to the bridge', async () => {
    const record = scene();
    const story = setup(record);
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} />);
    const socket = await story.open();
    await proposeTo(socket, record, 80);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull());

    expect(screen.getByText(/waited too long/)).toBeTruthy();
    await waitFor(() => expect(socket.results()).toEqual([
      { toolCallId: 'call-1', ok: true, result: { accepted: false, allowed: false, reason: 'expired' } },
    ]));
    expect(story.saveSceneRecord).not.toHaveBeenCalled();
  });

  // Apply was pressed; the open document is still being saved in front of the
  // change when the call behind it goes away.
  it('writes nothing when the call is withdrawn while the document is being saved', async () => {
    const record = scene();
    const story = setup(record);
    const held = heldBarrier();
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={held.barrier} />);
    const socket = await story.open();
    await proposeTo(socket, record);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(held.barrier).toHaveBeenCalled());
    act(() => socket.receive('tool_cancel', { toolCallId: 'call-1', reason: 'INTERRUPTED' }));
    await held.open();

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull());
    expect(screen.getByText(/withdrew this proposal/)).toBeTruthy();
    expect(story.saveSceneRecord).not.toHaveBeenCalled();
    await settle();
    expect(socket.results()).toEqual([]);
  });

  it('writes nothing when the card’s time runs out while the document is being saved', async () => {
    const record = scene();
    const story = setup(record);
    const held = heldBarrier();
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={held.barrier} />);
    const socket = await story.open();
    await proposeTo(socket, record, CLICKABLE_TTL_MS);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(held.barrier).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, CLICKABLE_TTL_MS + 100)); });
    await held.open();

    await waitFor(() => expect(socket.results()).toEqual([
      { toolCallId: 'call-1', ok: true, result: { accepted: false, reason: 'expired' } },
    ]));
    expect(story.saveSceneRecord).not.toHaveBeenCalled();
    expect(screen.getByText(/waited too long/)).toBeTruthy();
  });

  // The gate stops a write, and the write's handler takes the card down. When
  // the document could not be saved there is no write and no handler: the
  // ending of the call still has to be finished.
  it('takes the card down when the call was withdrawn and the document then could not be saved', async () => {
    const record = scene();
    const story = setup(record);
    const held = heldBarrier();
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={held.barrier} />);
    const socket = await story.open();
    await proposeTo(socket, record);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(held.barrier).toHaveBeenCalled());
    act(() => socket.receive('tool_cancel', { toolCallId: 'call-1', reason: 'INTERRUPTED' }));
    await held.open(false);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull());
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    expect(screen.getByText(/withdrew this proposal/)).toBeTruthy();
    expect(story.saveSceneRecord).not.toHaveBeenCalled();
    await settle();
    expect(socket.results()).toEqual([]);
  });

  it('says the card’s time ran out when the document then could not be saved', async () => {
    const record = scene();
    const story = setup(record);
    const held = heldBarrier();
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={held.barrier} />);
    const socket = await story.open();
    await proposeTo(socket, record, CLICKABLE_TTL_MS);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(held.barrier).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, CLICKABLE_TTL_MS + 100)); });
    await held.open(false);

    await waitFor(() => expect(socket.results()).toEqual([
      { toolCallId: 'call-1', ok: true, result: { accepted: false, allowed: false, reason: 'expired' } },
    ]));
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    expect(story.saveSceneRecord).not.toHaveBeenCalled();
  });

  // A failed save on its own ends nothing: the call is alive, and the author
  // may press Apply again once the document saves.
  it('keeps the card for another try when the document could not be saved and the call is alive', async () => {
    const record = scene();
    const story = setup(record);
    const held = heldBarrier();
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={held.barrier} />);
    const socket = await story.open();
    await proposeTo(socket, record);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(held.barrier).toHaveBeenCalledTimes(1));
    await held.open(false);
    await settle();

    expect(socket.results()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(held.barrier).toHaveBeenCalledTimes(2));
    await held.open(true);

    await waitFor(() => expect(socket.results()).toEqual([{ toolCallId: 'call-1', ok: true, result: { accepted: true } }]));
    expect(story.saveSceneRecord).toHaveBeenCalledTimes(1);
  });

  // An Undo holds the same guard as an Apply and has no card of its own, so
  // nothing it runs would ever take down a card whose call ended meanwhile.
  it('takes the card down when its call was withdrawn while an earlier change was being undone', async () => {
    const record = scene();
    const story = setup(record);
    const restoreStorySnapshot = vi.fn(async () => true);
    useAppStore.setState({ restoreStorySnapshot });
    useAiChatStore.setState({ lastAppliedChange: { kind: 'scene', storyId: 'story-1', snapshotId: 'snap-0' } });
    const held = heldBarrier();
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={held.barrier} />);
    const socket = await story.open();
    await proposeTo(socket, record);

    fireEvent.click(screen.getByRole('button', { name: 'Undo AI changes' }));
    await waitFor(() => expect(held.barrier).toHaveBeenCalled());
    act(() => socket.receive('tool_cancel', { toolCallId: 'call-1', reason: 'TURN_ENDED' }));
    await held.open(true);

    await waitFor(() => expect(restoreStorySnapshot).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull());
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    expect(screen.getByText(/withdrew this proposal/)).toBeTruthy();
  });

  it('writes nothing when the capability is blocked while the card is up', async () => {
    const record = scene();
    const story = setup(record);
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} />);
    const socket = await story.open();
    await proposeTo(socket, record);

    act(() => useAppStore.setState(state => ({
      settings: { ...state.settings, aiPermissions: { ...normalizeAiPermissions(state.settings.aiPermissions), scene_edit: 'blocked' } },
    })));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(socket.results()).toEqual([
      { toolCallId: 'call-1', ok: true, result: { accepted: false, reason: 'PERMISSION_DENIED' } },
    ]));
    expect(story.saveSceneRecord).not.toHaveBeenCalled();
    expect(screen.getByText(/blocked in the AI permissions/)).toBeTruthy();
  });

  it('reports a change as applied once it is written, whatever is withdrawn afterwards', async () => {
    const record = scene();
    const story = setup(record);
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} />);
    const socket = await story.open();
    await proposeTo(socket, record);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(story.saveSceneRecord).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(socket.results()).toEqual([{ toolCallId: 'call-1', ok: true, result: { accepted: true } }]));
    act(() => socket.receive('tool_cancel', { toolCallId: 'call-1', reason: 'TURN_ENDED' }));
    await settle();

    expect(screen.queryByText(/withdrew this proposal/)).toBeNull();
    expect(socket.results()).toHaveLength(1);
  });

  // A withdrawn request for paid work must not be granted by a click that
  // comes after it.
  it('takes a permission card down with its call, so nothing can be allowed late', async () => {
    const record = scene();
    const story = setup(record);
    render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} />);
    const socket = await story.open();
    act(() => socket.receive('tool_call', { toolCallId: 'call-2', toolName: 'authorize_capability', input: { capability: 'image_generate' }, origin: 'chat', ttlMs: 600_000 }));
    await waitFor(() => expect(useAiChatStore.getState().pendingInteraction?.kind).toBe('capability'));

    act(() => socket.receive('tool_cancel', { toolCallId: 'call-2', reason: 'TURN_ENDED' }));

    await waitFor(() => expect(useAiChatStore.getState().pendingInteraction).toBeNull());
    await settle();
    expect(socket.results()).toEqual([]);
  });
});
