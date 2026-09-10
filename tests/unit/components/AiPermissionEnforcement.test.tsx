import React from 'react';
import { render, waitFor } from '@testing-library/react';

import { AiChatPanel } from '@/components/ai-chat/AiChatPanel';
import { defaultAiPermissions } from '@/lib/ai/permissions';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { makeEnvelope } from '@/lib/bridge-protocol';
import type { SceneRecord } from '@/lib/engine/types';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';

class SocketMock {
  static instances: SocketMock[] = [];
  static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSED = 3;
  readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSED = 3;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror = null; onclose = null;
  sent: string[] = [];
  send = vi.fn((raw: string) => this.sent.push(raw));
  close = vi.fn(() => { this.readyState = 3; });
  constructor() { SocketMock.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

const record: SceneRecord = {
  id: 'scene-1', storyId: 'story-1', name: 'Before', description: '', tags: [], timeline: [],
  sceneState: { backgroundAssetId: null, backgroundTransition: 'fade', characters: [], activeEffects: [], musicTrackId: null, musicPlaying: false, musicVolume: 1, variables: {}, dialogueHistory: [], currentChoices: null, isTransitioning: false, transitionTarget: null },
  flowX: 0, flowY: 0, connections: [], isStart: true, createdAt: 1, updatedAt: 1,
};

function proposal() {
  return { storyId: 'story-1', sceneId: 'scene-1', expectedRevision: computeSceneRevision(record), explanation: 'Rename', operations: [{ op: 'update_scene_metadata', updates: { name: 'After' } }] };
}

describe('AI proposal permission enforcement', () => {
  beforeEach(() => {
    SocketMock.instances = [];
    vi.stubGlobal('WebSocket', SocketMock);
    useAiChatStore.setState({
      messages: [], status: 'idle', pendingInteraction: null,
      appliedChangesByStory: {}, appliedChanges: [], lastAppliedChange: null,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('blocks a scene proposal without touching the store', async () => {
    const saveSceneRecord = vi.fn();
    useAppStore.setState({
      aiBridgeSettings: { url: 'ws://localhost:8787', token: 'token', disabled: false },
      settings: { ...useAppStore.getState().settings, aiPermissions: { ...defaultAiPermissions, scene_edit: 'blocked' } },
      sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [], saveSceneRecord,
    });
    const view = render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} />);
    const socket = SocketMock.instances[0]; socket.open();
    socket.receive(makeEnvelope('tool_call', { toolCallId: 'blocked', toolName: 'propose_scene_patch', input: { patch: proposal() } }));
    await waitFor(() => expect(socket.sent.some(raw => raw.includes('PERMISSION_DENIED'))).toBe(true));
    expect(saveSceneRecord).not.toHaveBeenCalled();
    expect(useAiChatStore.getState().appliedChanges).toHaveLength(0);
    view.unmount();
  });

  // The auto path applies with no dialog, so nothing else would land the
  // author's draft first — and the patch was validated against the store the
  // draft has already moved past.
  it('runs the save barrier before an auto-applied scene patch', async () => {
    const order: string[] = [];
    const saveSceneRecord = vi.fn(() => { order.push('mutate'); });
    useAppStore.setState({
      aiBridgeSettings: { url: 'ws://localhost:8787', token: 'token', disabled: false },
      settings: { ...useAppStore.getState().settings, aiPermissions: { ...defaultAiPermissions, scene_edit: 'auto' } },
      sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [],
      createStorySnapshot: vi.fn(async () => ({ id: 'snap-auto', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true })), saveSceneRecord,
    });
    const beforeStoryMutation = vi.fn(async () => { order.push('barrier'); return true; });
    const view = render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={beforeStoryMutation} />);
    const socket = SocketMock.instances[0]; socket.open();
    socket.receive(makeEnvelope('tool_call', { toolCallId: 'auto', toolName: 'propose_scene_patch', input: { patch: proposal() } }));

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalled());
    expect(order).toEqual(['barrier', 'mutate']);
    view.unmount();
  });

  it('fails the auto-applied patch instead of mutating when the draft will not save', async () => {
    const saveSceneRecord = vi.fn();
    useAppStore.setState({
      aiBridgeSettings: { url: 'ws://localhost:8787', token: 'token', disabled: false },
      settings: { ...useAppStore.getState().settings, aiPermissions: { ...defaultAiPermissions, scene_edit: 'auto' } },
      sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [],
      createStorySnapshot: vi.fn(), saveSceneRecord,
    });
    const view = render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => false} />);
    const socket = SocketMock.instances[0]; socket.open();
    socket.receive(makeEnvelope('tool_call', { toolCallId: 'auto', toolName: 'propose_scene_patch', input: { patch: proposal() } }));

    await waitFor(() => expect(socket.sent.some(raw => raw.includes('Could not save the open document'))).toBe(true));
    expect(saveSceneRecord).not.toHaveBeenCalled();
    expect(useAiChatStore.getState().appliedChanges).toHaveLength(0);
    view.unmount();
  });

  // The bridge dispatches tool calls without awaiting the previous one, so two
  // auto-applied patches can both pass their revision check and the second
  // silently overwrites the first unless they are serialised.
  it('serialises two auto-applied patches arriving together', async () => {
    const order: string[] = [];
    const saveSceneRecord = vi.fn(() => { order.push('mutate'); });
    useAppStore.setState({
      aiBridgeSettings: { url: 'ws://localhost:8787', token: 'token', disabled: false },
      settings: { ...useAppStore.getState().settings, aiPermissions: { ...defaultAiPermissions, scene_edit: 'auto' } },
      sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [],
      createStorySnapshot: vi.fn(async () => ({ id: 'snap-auto', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true })), saveSceneRecord,
    });
    let openBarrier: (() => void) | undefined;
    const beforeStoryMutation = vi.fn(() => {
      order.push('barrier');
      return new Promise<boolean>((resolve) => {
        // Only the first call is held; later ones resolve immediately.
        if (openBarrier) { resolve(true); return; }
        openBarrier = () => resolve(true);
      });
    });

    const view = render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={beforeStoryMutation} />);
    const socket = SocketMock.instances[0]; socket.open();
    socket.receive(makeEnvelope('tool_call', { toolCallId: 'auto-1', toolName: 'propose_scene_patch', input: { patch: proposal() } }));
    socket.receive(makeEnvelope('tool_call', { toolCallId: 'auto-2', toolName: 'propose_scene_patch', input: { patch: proposal() } }));

    await waitFor(() => expect(beforeStoryMutation).toHaveBeenCalledTimes(1));
    // The second call has not started while the first is still in its barrier.
    expect(order).toEqual(['barrier']);

    openBarrier?.();

    // Both tool calls must finish and be answered: serialising them must not
    // drop the second, and the second must never interleave with the first.
    await waitFor(() => {
      expect(socket.sent.some((raw) => raw.includes('auto-1'))).toBe(true);
      expect(socket.sent.some((raw) => raw.includes('auto-2'))).toBe(true);
    });
    expect(order).toEqual(['barrier', 'mutate', 'barrier', 'mutate']);
    expect(saveSceneRecord).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('auto-applies through the adapter and records the undo journal', async () => {
    const saveSceneRecord = vi.fn();
    useAppStore.setState({
      aiBridgeSettings: { url: 'ws://localhost:8787', token: 'token', disabled: false },
      settings: { ...useAppStore.getState().settings, aiPermissions: { ...defaultAiPermissions, scene_edit: 'auto' } },
      sceneRecordsByStory: { 'story-1': { 'scene-1': record } }, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [],
      createStorySnapshot: vi.fn(async () => ({ id: 'snap-auto', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true })), saveSceneRecord,
    });
    const view = render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} />);
    const socket = SocketMock.instances[0]; socket.open();
    socket.receive(makeEnvelope('tool_call', { toolCallId: 'auto', toolName: 'propose_scene_patch', input: { patch: proposal() } }));
    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalledWith(expect.objectContaining({ name: 'After' })));
    expect(useAiChatStore.getState().appliedChanges.at(-1)).toMatchObject({ kind: 'scene', snapshotId: 'snap-auto' });
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    view.unmount();
  });
});
