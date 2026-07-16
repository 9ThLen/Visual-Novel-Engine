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
    const view = render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" />);
    const socket = SocketMock.instances[0]; socket.open();
    socket.receive(makeEnvelope('tool_call', { toolCallId: 'blocked', toolName: 'propose_scene_patch', input: { patch: proposal() } }));
    await waitFor(() => expect(socket.sent.some(raw => raw.includes('PERMISSION_DENIED'))).toBe(true));
    expect(saveSceneRecord).not.toHaveBeenCalled();
    expect(useAiChatStore.getState().appliedChanges).toHaveLength(0);
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
    const view = render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" />);
    const socket = SocketMock.instances[0]; socket.open();
    socket.receive(makeEnvelope('tool_call', { toolCallId: 'auto', toolName: 'propose_scene_patch', input: { patch: proposal() } }));
    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalledWith(expect.objectContaining({ name: 'After' })));
    expect(useAiChatStore.getState().appliedChanges.at(-1)).toMatchObject({ kind: 'scene', snapshotId: 'snap-auto' });
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    view.unmount();
  });
});
