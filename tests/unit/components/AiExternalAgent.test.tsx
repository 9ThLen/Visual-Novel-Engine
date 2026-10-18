/**
 * An agent outside the app, as the editor sees it.
 *
 * The bridge forwards such an agent's calls marked `origin: 'external'`. What
 * the editor does with them is the author's to say — off unless turned on —
 * and at no setting does such an agent write by itself.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AiBridgeSessionProvider } from '@/components/ai-chat/AiBridgeSessionProvider';
import { DocumentRightRail } from '@/components/document-editor/DocumentRightRail';
import { EXTERNAL_ACCESS_OFF, externalCallRefusal } from '@/lib/ai/app-tool-executor';
import { withActiveAiBridgeProfileStored, type AiBridgeSettings } from '@/lib/ai/bridge-config';
import type { CaptureEditorContext, EditorContextCapture } from '@/lib/ai/editor-context-capture';
import { sceneRecordToDocumentScene } from '@/lib/document-editor/document-scene';
import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';
import { defaultAiPermissions, type AiPermissions, type ExternalAgentAccess } from '@/lib/ai/permissions';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { makeEnvelope, type BridgeEnvelope } from '@/lib/bridge-protocol';
import { createTextStep } from '@/lib/engine/event-factory';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { mergeLegacyUserSettings, normalizeUserSettings } from '@/lib/user-settings';
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

const metadata: StoryMetadata = { id: 'story-1', title: 'story-1', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 1 };
const snapshotRecord = { id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true };

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
  resultFor(toolCallId: string) { return this.results().find(result => result.toolCallId === toolCallId); }
}

const passes = async () => true;

const selection: VNPlateSelectionState = {
  seq: 1,
  collapsed: false,
  text: 'Дощ почався',
  textLength: 11,
  truncated: false,
  before: '',
  after: '.',
  crossesChip: false,
  blocks: [{ id: 'step_rain', kind: 'text', quote: 'Дощ почався', occurrence: 0 }],
};

/** What the editor hands back when asked where the author is: the stored scene, with a line selected. */
function captureOf(record: SceneRecord): EditorContextCapture {
  return {
    sceneId: record.id,
    sceneSource: 'selection',
    document: sceneRecordToDocumentScene(record),
    selection,
    hasUnsavedChanges: false,
    activePathSceneIds: [record.id],
  };
}

function Editor({ approvalSurface, barrier = passes, capture }: {
  approvalSurface?: boolean;
  barrier?: () => Promise<boolean>;
  capture?: CaptureEditorContext;
}) {
  return (
    <AiBridgeSessionProvider storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={barrier} approvalSurface={approvalSurface} captureEditorContext={capture}>
      <DocumentRightRail
        scene={null}
        storyId="story-1"
        activeSceneId="scene-1"
        characters={[]}
        storyScenes={[]}
        beforeStoryMutation={barrier}
        captureEditorContext={async () => ({ ok: false })}
      />
    </AiBridgeSessionProvider>
  );
}

/**
 * The app store in these tests is a plain object and tells nobody when it
 * changes. The chat store is the real one: nudging it makes the session read
 * the settings again, as the real app store would have made it.
 */
function changeSettings(partial: Partial<ReturnType<typeof normalizeUserSettings>>) {
  useAppStore.setState({ settings: normalizeUserSettings({ ...useAppStore.getState().settings, ...partial }) });
  useAiChatStore.setState(state => ({ messages: [...state.messages] }));
}

/** The store's own way of writing the bridge settings, with the same nudge. */
function changeBridgeSettings(partial: Partial<AiBridgeSettings>) {
  useAppStore.setState({ aiBridgeSettings: withActiveAiBridgeProfileStored({ ...useAppStore.getState().aiBridgeSettings, ...partial }) });
  useAiChatStore.setState(state => ({ messages: [...state.messages] }));
}

function allow(access: ExternalAgentAccess, permissions: Partial<AiPermissions> = {}) {
  act(() => changeSettings({ externalAgentAccess: access, aiPermissions: { ...defaultAiPermissions, ...permissions } }));
}

async function connect(capabilities: Record<string, unknown> = {}) {
  fireEvent.click(screen.getByText('AI'));
  await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
  const socket = SocketMock.instances[0];
  act(() => {
    socket.readyState = 1;
    socket.onopen?.(new Event('open'));
    socket.receive('session_started', {
      sessionId: 'session-1',
      provider: 'openai',
      capabilities: {
        chat: { supported: true },
        externalAgent: { enabled: true },
        attachments: { supported: false, kinds: [], maxCount: 4, maxDecodedBytes: 5 * 1024 * 1024 },
        ...capabilities,
      },
    });
  });
  await waitFor(() => expect(screen.getAllByText(/^Connected/).length).toBeGreaterThan(0));
  return socket;
}

function patch(): AiScenePatch {
  const record = scene();
  return {
    storyId: record.storyId,
    sceneId: record.id,
    expectedRevision: computeSceneRevision(record),
    explanation: 'Describe the scene',
    operations: [{ op: 'update_scene_metadata', updates: { description: 'Written by an agent' } }],
  };
}

/** A call as the bridge forwards it for an agent outside the app. */
function external(socket: SocketMock, toolCallId: string, toolName: string, input: unknown, ttlMs?: number) {
  act(() => socket.receive('tool_call', {
    toolCallId, toolName, input, origin: 'external', untrustedAttachmentMode: true, ...(ttlMs === undefined ? {} : { ttlMs }),
  }));
}

const propose = (socket: SocketMock, toolCallId = 'proposal-1') => external(socket, toolCallId, 'propose_scene_patch', { patch: patch() }, 600_000);
const systemMessages = () => (useAiChatStore.getState().messagesByStory['story-1'] ?? [])
  .filter(message => message.role === 'system')
  .map(message => message.text);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

describe('an external agent in the editor', () => {
  let saveSceneRecord: ReturnType<typeof vi.fn>;
  let createStorySnapshot: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    SocketMock.instances = [];
    vi.stubGlobal('WebSocket', SocketMock);
    saveSceneRecord = vi.fn();
    createStorySnapshot = vi.fn(async () => snapshotRecord);
    const record = scene();
    useAppStore.setState({
      storiesMetadata: [metadata],
      sceneRecordsByStory: { 'story-1': { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot,
      saveSceneRecord,
      settings: normalizeUserSettings({}),
      updateSettings: changeSettings,
      aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'token', disabled: false },
    });
    useAiChatStore.setState({
      messagesByStory: {},
      messages: [],
      status: 'idle',
      pendingInteraction: null,
      appliedChangesByStory: {},
      appliedChanges: [],
      lastAppliedChange: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ aiBridgeSettings: { url: '', token: '', disabled: false }, settings: normalizeUserSettings({}) });
  });

  it('is answered no to everything until the author lets it in', async () => {
    render(<Editor />);
    const socket = await connect();

    external(socket, 'read', 'get_scene', { sceneId: 'scene-1' });
    propose(socket);

    await waitFor(() => expect(socket.results()).toHaveLength(2));
    for (const result of socket.results()) {
      expect(result).toMatchObject({ ok: false, errorCode: 'PERMISSION_DENIED', details: { reason: 'EXTERNAL_ACCESS_OFF' } });
    }
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
  });

  it('may read, and only read, when it is let in to read', async () => {
    render(<Editor />);
    const socket = await connect();
    allow('read');

    external(socket, 'read', 'get_scene', { sceneId: 'scene-1' });
    propose(socket);

    await waitFor(() => expect(socket.results()).toHaveLength(2));
    expect(socket.resultFor('read')).toMatchObject({ ok: true });
    expect(socket.resultFor('proposal-1')).toMatchObject({ ok: false, errorCode: 'PERMISSION_DENIED', details: { reason: 'EXTERNAL_PROPOSALS_OFF' } });
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  // The author may let the built-in assistant apply scene edits on its own.
  // That is said about the assistant, and does not extend to somebody else's agent.
  it('is asked about even where the built-in assistant applies on its own', async () => {
    render(<Editor />);
    const socket = await connect();
    allow('propose', { scene_edit: 'auto' });

    propose(socket);

    expect(await screen.findByRole('button', { name: 'Apply' })).toBeTruthy();
    expect(screen.getByText('Proposed by an external agent')).toBeTruthy();
    expect(saveSceneRecord).not.toHaveBeenCalled();
    expect(socket.results()).toEqual([]);
    expect(useAiChatStore.getState().pendingInteraction).toMatchObject({ kind: 'scene_patch', origin: 'external' });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(socket.resultFor('proposal-1')).toEqual({ toolCallId: 'proposal-1', ok: true, result: { accepted: true } }));
    expect(screen.queryByText('Proposed by an external agent')).toBeNull();
  });

  // The bridge marks such a call as untrusted too, which alone would make the
  // app ask. The app does not lean on that: the origin is enough.
  it('is asked about even if the bridge forgot to mark its call untrusted', async () => {
    render(<Editor />);
    const socket = await connect();
    allow('propose', { scene_edit: 'auto' });

    act(() => socket.receive('tool_call', {
      toolCallId: 'proposal-1', toolName: 'propose_scene_patch', input: { patch: patch() }, origin: 'external', untrustedAttachmentMode: false, ttlMs: 600_000,
    }));

    expect(await screen.findByRole('button', { name: 'Apply' })).toBeTruthy();
    expect(saveSceneRecord).not.toHaveBeenCalled();
  });

  it('does not have its name put on a card the built-in assistant made', async () => {
    render(<Editor />);
    const socket = await connect();
    allow('propose');

    act(() => socket.receive('tool_call', { toolCallId: 'chat-1', toolName: 'propose_scene_patch', input: { patch: patch() }, origin: 'chat', ttlMs: 600_000 }));

    expect(await screen.findByRole('button', { name: 'Apply' })).toBeTruthy();
    expect(screen.queryByText('Proposed by an external agent')).toBeNull();
  });

  it('is refused at once where nothing can show the author a card', async () => {
    const view = render(<Editor />);
    const socket = await connect();
    allow('propose');
    // Focus mode: the rail, and the chat in it, are gone.
    view.rerender(<Editor approvalSurface={false} />);

    propose(socket);
    external(socket, 'read', 'list_scenes', {});

    await waitFor(() => expect(socket.results()).toHaveLength(2));
    expect(socket.resultFor('proposal-1')).toMatchObject({ ok: false, errorCode: 'PROVIDER_UNAVAILABLE', details: { reason: 'NO_APPROVAL_SURFACE' } });
    // Reading needs nobody to look.
    expect(socket.resultFor('read')).toMatchObject({ ok: true });
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    expect(SocketMock.instances).toHaveLength(1);
  });

  it('does not push aside a proposal that is already in front of the author', async () => {
    render(<Editor />);
    const socket = await connect();
    allow('propose');
    propose(socket, 'first');
    await screen.findByRole('button', { name: 'Apply' });

    propose(socket, 'second');

    await waitFor(() => expect(socket.resultFor('second')).toMatchObject({ ok: false, details: { reason: 'INTERACTION_PENDING' } }));
    expect(socket.resultFor('first')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(socket.resultFor('first')).toMatchObject({ ok: true, result: { accepted: true } }));
  });

  it('is not given a tool the registry keeps for the built-in assistant, whatever the bridge forwards', async () => {
    render(<Editor />);
    const socket = await connect();
    allow('propose');

    external(socket, 'bytes', 'get_image_binary', { assetId: 'asset-1' });
    external(socket, 'paid', 'remove_background', { assetId: 'asset-1' });

    await waitFor(() => expect(socket.results()).toHaveLength(2));
    for (const result of socket.results()) {
      expect(result).toMatchObject({ ok: false, errorCode: 'PERMISSION_DENIED', details: { reason: 'TOOL_NOT_EXTERNAL' } });
    }
  });

  describe('when the author takes its access away', () => {
    it.each([
      ['proposals are turned off', () => allow('read')],
      ['everything is turned off', () => allow('off')],
      ['the kind of change it proposed is blocked', () => allow('propose', { scene_edit: 'blocked' })],
    ])('withdraws the proposal on screen when %s', async (_name, revoke) => {
      render(<Editor />);
      const socket = await connect();
      allow('propose');
      propose(socket);
      await screen.findByRole('button', { name: 'Apply' });

      revoke();

      await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull());
      expect(socket.resultFor('proposal-1')).toEqual({
        toolCallId: 'proposal-1', ok: true, result: { accepted: false, allowed: false, reason: 'cancelled', detail: 'ACCESS_REVOKED' },
      });
      expect(useAiChatStore.getState().pendingInteraction).toBeNull();
      expect(systemMessages()).toContain('You no longer let the external agent propose this, so its proposal was withdrawn.');
      expect(saveSceneRecord).not.toHaveBeenCalled();
    });

    it('leaves the built-in assistant’s card where it is', async () => {
      render(<Editor />);
      const socket = await connect();
      allow('propose');
      act(() => socket.receive('tool_call', { toolCallId: 'chat-1', toolName: 'propose_scene_patch', input: { patch: patch() }, origin: 'chat', ttlMs: 600_000 }));
      await screen.findByRole('button', { name: 'Apply' });

      allow('off');

      expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
      expect(socket.results()).toEqual([]);
    });

    // Asked again in the step that writes, of the settings themselves: the
    // write does not wait for the session to notice the switch was turned.
    it('writes nothing even before the session has noticed', async () => {
      const snapshot = deferred<typeof snapshotRecord>();
      createStorySnapshot.mockImplementation(() => snapshot.promise);
      render(<Editor />);
      const socket = await connect();
      allow('propose');
      propose(socket);
      fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(createStorySnapshot).toHaveBeenCalled());

      // Straight into the store, with nothing told to the session.
      useAppStore.setState({ settings: normalizeUserSettings({ ...useAppStore.getState().settings, externalAgentAccess: 'read' }) });
      await act(async () => { snapshot.resolve(snapshotRecord); await snapshot.promise; });

      await waitFor(() => expect(socket.resultFor('proposal-1')).toEqual({
        toolCallId: 'proposal-1', ok: true, result: { accepted: false, reason: 'cancelled', detail: 'ACCESS_REVOKED' },
      }));
      expect(saveSceneRecord).not.toHaveBeenCalled();
    });

    it('writes nothing for an Apply that was already on its way', async () => {
      const snapshot = deferred<typeof snapshotRecord>();
      createStorySnapshot.mockImplementation(() => snapshot.promise);
      render(<Editor />);
      const socket = await connect();
      allow('propose');
      propose(socket);
      fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(createStorySnapshot).toHaveBeenCalled());

      allow('read');
      await act(async () => { snapshot.resolve(snapshotRecord); await snapshot.promise; });

      await waitFor(() => expect(socket.resultFor('proposal-1')).toEqual({
        toolCallId: 'proposal-1', ok: true, result: { accepted: false, reason: 'cancelled', detail: 'ACCESS_REVOKED' },
      }));
      expect(saveSceneRecord).not.toHaveBeenCalled();
      expect(systemMessages()).toContain('You no longer let the external agent propose this, so nothing was applied.');
    });

    // Apply saves the open document first. If that fails there is no write
    // for the gate to stop, and nothing the write would have done afterwards:
    // the agent must be told all the same, and the card must not stay.
    it('tells the agent and takes the card down when the document then could not be saved', async () => {
      const save = deferred<boolean>();
      const barrier = vi.fn(() => save.promise);
      render(<Editor barrier={barrier} />);
      const socket = await connect();
      allow('propose');
      propose(socket);
      fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(barrier).toHaveBeenCalled());

      allow('read');
      await act(async () => { save.resolve(false); await save.promise; });

      await waitFor(() => expect(socket.resultFor('proposal-1')).toEqual({
        toolCallId: 'proposal-1', ok: true, result: { accepted: false, allowed: false, reason: 'cancelled', detail: 'ACCESS_REVOKED' },
      }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull());
      expect(useAiChatStore.getState().pendingInteraction).toBeNull();
      expect(systemMessages()).toContain('You no longer let the external agent propose this, so its proposal was withdrawn.');
      expect(saveSceneRecord).not.toHaveBeenCalled();

      // The queue is free again: the next proposal is shown, not refused.
      allow('propose');
      propose(socket, 'proposal-2');
      expect(await screen.findByRole('button', { name: 'Apply' })).toBeTruthy();
      expect(socket.resultFor('proposal-2')).toBeUndefined();
    });
  });

  describe('the switch', () => {
    const openSettings = () => fireEvent.click(screen.getByLabelText('AI settings'));

    it('is off for an author who has never touched it, and is theirs to turn', async () => {
      render(<Editor />);
      await connect();
      openSettings();

      expect(screen.getByText('External agent')).toBeTruthy();
      // The line under the switch describes the level that is chosen.
      expect(screen.getByText(/answers no to everything/)).toBeTruthy();

      fireEvent.click(screen.getByLabelText('External agent access: Read and propose'));

      expect(useAppStore.getState().settings.externalAgentAccess).toBe('propose');
      expect(screen.getByText(/You apply or reject each one/)).toBeTruthy();
      expect(screen.queryByText(/answers no to everything/)).toBeNull();
    });

    it('says so when the bridge it is connected to offers no agent anything', async () => {
      render(<Editor />);
      await connect({ externalAgent: undefined });
      allow('read');
      openSettings();

      expect(screen.getByText(/started without --mcp/)).toBeTruthy();
    });

    it('says nothing of the kind when the bridge does', async () => {
      render(<Editor />);
      await connect();
      allow('read');
      openSettings();

      expect(screen.queryByText(/started without --mcp/)).toBeNull();
    });
  });
});

/**
 * An agent outside the app has no message to carry a context with. What it is
 * given to act on is what the author hands over, by a button of their own:
 * that saves, so the context names steps that exist, and the agent reading it
 * afterwards never makes the editor save anything.
 */
describe('what the author hands to an external agent', () => {
  let saveSceneRecord: ReturnType<typeof vi.fn>;
  let capture: ReturnType<typeof vi.fn<CaptureEditorContext>>;

  beforeEach(() => {
    SocketMock.instances = [];
    vi.stubGlobal('WebSocket', SocketMock);
    saveSceneRecord = vi.fn();
    const record = scene();
    capture = vi.fn<CaptureEditorContext>(async () => ({ ok: true, capture: captureOf(scene()) }));
    useAppStore.setState({
      storiesMetadata: [metadata],
      sceneRecordsByStory: { 'story-1': { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot: vi.fn(async () => snapshotRecord),
      saveSceneRecord,
      settings: normalizeUserSettings({}),
      updateSettings: changeSettings,
      aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'token', disabled: false },
    });
    useAiChatStore.setState({
      messagesByStory: {},
      messages: [],
      status: 'idle',
      pendingInteraction: null,
      appliedChangesByStory: {},
      appliedChanges: [],
      lastAppliedChange: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ aiBridgeSettings: { url: '', token: '', disabled: false }, settings: normalizeUserSettings({}) });
  });

  const contextOf = (result: Record<string, unknown> | undefined) => (result?.result as { context: Record<string, any> | null; hint?: string });
  const handOver = () => fireEvent.click(screen.getByRole('button', { name: 'Save and hand to agent' }));

  it('is not offered, and nothing is said about an agent, while access is off', async () => {
    render(<Editor capture={capture} />);
    await connect();

    expect(screen.queryByRole('button', { name: 'Save and hand to agent' })).toBeNull();
    expect(screen.queryByText(/External agent ·/)).toBeNull();

    allow('read');

    expect(screen.getByRole('button', { name: 'Save and hand to agent' })).toBeTruthy();
    expect(screen.getByText('External agent · no calls yet')).toBeTruthy();
  });

  it('is nothing until the author presses the button, and the agent is told how to get it', async () => {
    render(<Editor capture={capture} />);
    const socket = await connect();
    allow('read');

    external(socket, 'context', 'get_editor_context', {});

    await waitFor(() => expect(socket.resultFor('context')).toBeTruthy());
    expect(contextOf(socket.resultFor('context'))).toEqual({ context: null, hint: expect.stringContaining('Save and hand to agent') });
    // Asking is not a reason to save, or even to look.
    expect(capture).not.toHaveBeenCalled();
  });

  it('is the selection, saved and addressed, once the button is pressed', async () => {
    render(<Editor capture={capture} />);
    const socket = await connect();
    allow('read');

    handOver();

    expect(await screen.findByText(/^Handed over at .*Дощ почався/)).toBeTruthy();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({ save: true });

    external(socket, 'context', 'get_editor_context', {});
    await waitFor(() => expect(socket.resultFor('context')).toBeTruthy());
    const { context } = contextOf(socket.resultFor('context'));
    expect(context).toMatchObject({
      kind: 'fixed',
      storyId: 'story-1',
      scene: { id: 'scene-1', revision: computeSceneRevision(scene()) },
      selection: { text: 'Дощ почався', anchors: [{ stepId: 'step_rain', match: 'exact' }] },
    });
    // Reading it back saved nothing more.
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('belongs to the agent alone: the built-in assistant has a slot of its own', async () => {
    render(<Editor capture={capture} />);
    const socket = await connect();
    allow('read');
    handOver();
    await screen.findByText(/^Handed over at/);

    act(() => socket.receive('tool_call', { toolCallId: 'chat-context', toolName: 'get_editor_context', input: {}, origin: 'chat' }));

    await waitFor(() => expect(socket.resultFor('chat-context')).toBeTruthy());
    expect(contextOf(socket.resultFor('chat-context'))).toEqual({ context: null, hint: expect.stringContaining('No context came with this message') });
  });

  it('lets the agent read the editor as it is now, without saving', async () => {
    render(<Editor capture={capture} />);
    const socket = await connect();
    allow('read');

    external(socket, 'live', 'get_editor_context', { mode: 'live' });

    await waitFor(() => expect(socket.resultFor('live')).toBeTruthy());
    expect(contextOf(socket.resultFor('live')).context).toMatchObject({ kind: 'live' });
    expect(capture).toHaveBeenCalledWith({ save: false });
    expect(screen.queryByText(/^Handed over at/)).toBeNull();
  });

  it('stops being offered once its scene has changed', async () => {
    render(<Editor capture={capture} />);
    const socket = await connect();
    allow('read');
    handOver();
    await screen.findByText(/^Handed over at/);

    act(() => {
      useAppStore.setState({ sceneRecordsByStory: { 'story-1': { 'scene-1': { ...scene(), description: 'Edited since' } } } });
    });
    external(socket, 'context', 'get_editor_context', {});

    await waitFor(() => expect(socket.resultFor('context')).toBeTruthy());
    expect(contextOf(socket.resultFor('context'))).toEqual({ context: null, hint: expect.stringContaining('The scene changed') });
    await waitFor(() => expect(screen.queryByText(/^Handed over at/)).toBeNull());
  });

  it('hands nothing over when the document could not be saved, and says so', async () => {
    capture.mockResolvedValue({ ok: false });
    render(<Editor capture={capture} />);
    const socket = await connect();
    allow('read');

    handOver();

    await waitFor(() => expect(systemMessages()).toContain('The open document could not be saved, so nothing was handed to the agent.'));
    expect(screen.queryByText(/^Handed over at/)).toBeNull();
    external(socket, 'context', 'get_editor_context', {});
    await waitFor(() => expect(socket.resultFor('context')).toBeTruthy());
    expect(contextOf(socket.resultFor('context')).context).toBeNull();
  });

  // What the button is for: the agent acts on the revision it was handed, and
  // the change it proposes for it goes in at the first attempt.
  it('gives the agent a revision its proposal is applied on', async () => {
    render(<Editor capture={capture} />);
    const socket = await connect();
    allow('propose');
    handOver();
    await screen.findByText(/^Handed over at/);
    external(socket, 'context', 'get_editor_context', {});
    await waitFor(() => expect(socket.resultFor('context')).toBeTruthy());
    const handed = contextOf(socket.resultFor('context')).context!;

    external(socket, 'proposal-1', 'propose_scene_patch', {
      patch: {
        storyId: handed.storyId,
        sceneId: handed.scene.id,
        expectedRevision: handed.scene.revision,
        explanation: 'Rewrite the selected line',
        operations: [{ op: 'update_scene_metadata', updates: { description: 'For the line the author selected' } }],
      },
    }, 600_000);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(socket.resultFor('proposal-1')).toEqual({ toolCallId: 'proposal-1', ok: true, result: { accepted: true } }));
    expect(saveSceneRecord).toHaveBeenCalledTimes(1);
  });

  it('shows which call the agent made last', async () => {
    render(<Editor capture={capture} />);
    const socket = await connect();
    allow('read');

    external(socket, 'one', 'list_scenes', {});
    external(socket, 'two', 'get_scene', { sceneId: 'scene-1' });

    expect(await screen.findByText(/^External agent · last call get_scene · /)).toBeTruthy();
    expect(screen.queryByText('External agent · no calls yet')).toBeNull();
  });

  it('does not count a call the editor refused', async () => {
    render(<Editor capture={capture} />);
    const socket = await connect();
    allow('read');

    propose(socket);

    await waitFor(() => expect(socket.resultFor('proposal-1')).toBeTruthy());
    expect(screen.getByText('External agent · no calls yet')).toBeTruthy();
  });
});

/**
 * A bridge can run with no chat at all, for an agent of the author's own. The
 * author who wants only that connects without choosing a provider, and the
 * author who has one chosen and meets such a bridge is told what it is.
 */
describe('a bridge that runs without chat, from the editor', () => {
  const chatless = { chat: { supported: false }, externalAgent: { enabled: true }, attachments: { supported: false, kinds: [], maxCount: 4, maxDecodedBytes: 5 * 1024 * 1024 } };

  beforeEach(() => {
    SocketMock.instances = [];
    vi.stubGlobal('WebSocket', SocketMock);
    const record = scene();
    useAppStore.setState({
      storiesMetadata: [metadata],
      sceneRecordsByStory: { 'story-1': { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot: vi.fn(async () => snapshotRecord),
      saveSceneRecord: vi.fn(),
      settings: normalizeUserSettings({}),
      updateSettings: changeSettings,
      updateAiBridgeSettings: changeBridgeSettings,
      // An author who has never set up an AI provider.
      aiBridgeSettings: { url: '', token: '', disabled: false, preferredProvider: 'openai' },
    });
    useAiChatStore.setState({
      messagesByStory: {},
      messages: [],
      status: 'idle',
      pendingInteraction: null,
      appliedChangesByStory: {},
      appliedChanges: [],
      lastAppliedChange: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ aiBridgeSettings: { url: '', token: '', disabled: false }, settings: normalizeUserSettings({}) });
  });

  /** The bridge accepts the session the way one started with `--provider none --mcp` does: it names no provider. */
  async function accept(socket: SocketMock) {
    act(() => {
      socket.readyState = 1;
      socket.onopen?.(new Event('open'));
      socket.receive('session_started', { sessionId: 'session-1', capabilities: chatless });
    });
    await waitFor(() => expect(screen.getAllByText('Connected · external agent only').length).toBeGreaterThan(0));
  }
  const sessionStart = (socket: SocketMock) => socket.send.mock.calls
    .map(([raw]) => JSON.parse(raw as string) as BridgeEnvelope)
    .find(envelope => envelope.type === 'session_start')?.payload as Record<string, unknown>;

  it('is connected to by an author who has set up no AI provider at all', async () => {
    render(<Editor />);
    fireEvent.click(screen.getByText('AI'));

    fireEvent.click(screen.getByText('No chat'));

    // The command to start it asks for no model and no key.
    expect(screen.getByText(/--provider none --mcp/)).toBeTruthy();
    expect(screen.queryByText(/--image-provider/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Pairing token'), { target: { value: 'pairing-for-agent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
    const socket = SocketMock.instances[0];
    await accept(socket);

    expect(sessionStart(socket)).toMatchObject({ token: 'pairing-for-agent' });
    // No provider is named: there is none to prefer.
    expect(sessionStart(socket)).not.toHaveProperty('preferredProvider');
    expect(sessionStart(socket)).not.toHaveProperty('requestedModel');
    expect(screen.getByText(/There is no chat on this connection/)).toBeTruthy();
    expect(screen.getByPlaceholderText('No chat on this connection')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    const saved = useAppStore.getState().aiBridgeSettings as AiBridgeSettings;
    expect(saved).toMatchObject({ agentOnly: true, agentProfile: { token: 'pairing-for-agent' } });
    // The agent's token is nobody's provider profile.
    expect(JSON.stringify(saved.profiles)).not.toContain('pairing-for-agent');
  });

  it('serves the agent the author let in, over that connection', async () => {
    useAppStore.setState({ aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'pairing', disabled: false, agentOnly: true, agentProfile: { url: 'ws://127.0.0.1:8787', token: 'pairing' } } });
    render(<Editor />);
    fireEvent.click(screen.getByText('AI'));
    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
    const socket = SocketMock.instances[0];
    await accept(socket);
    allow('read');

    external(socket, 'read', 'list_scenes', {});

    await waitFor(() => expect(socket.resultFor('read')).toMatchObject({ ok: true, result: [{ id: 'scene-1', name: 'Library' }] }));
  });

  it('is told apart from an error by an author who has a provider chosen', async () => {
    useAppStore.setState({ aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'pairing', disabled: false, preferredProvider: 'openai' } });
    render(<Editor />);
    fireEvent.click(screen.getByText('AI'));
    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
    const socket = SocketMock.instances[0];
    await accept(socket);

    // The provider the author prefers was named, and was not a reason to refuse.
    expect(sessionStart(socket)).toMatchObject({ preferredProvider: 'openai' });
    expect(screen.getByText(/This bridge runs without chat: it serves an agent of your own/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Connection error')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('No chat on this connection'), { target: { value: 'hello?' } });
    fireEvent.click(screen.getByText('Send'));
    await act(async () => { await Promise.resolve(); });
    expect(socket.send.mock.calls.map(([raw]) => (JSON.parse(raw as string) as BridgeEnvelope).type)).not.toContain('user_message');
  });

  it('says why if a message reaches it all the same', async () => {
    useAppStore.setState({ aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'pairing', disabled: false, preferredProvider: 'openai' } });
    render(<Editor />);
    fireEvent.click(screen.getByText('AI'));
    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
    const socket = SocketMock.instances[0];
    await accept(socket);

    act(() => socket.receive('error', { code: 'PROVIDER_UNAVAILABLE', message: 'This bridge runs without chat', details: { reason: 'CHAT_UNSUPPORTED' } }));

    expect(await screen.findByText('This bridge runs without chat.')).toBeTruthy();
  });

  it('takes the author back to their provider, with that provider’s own token', async () => {
    useAppStore.setState({
      aiBridgeSettings: {
        url: 'ws://127.0.0.1:8899', token: 'pairing-for-agent', disabled: false, preferredProvider: 'openai',
        profiles: { openai: { url: 'ws://127.0.0.1:8787', token: 'openai-pairing' } },
        agentOnly: true, agentProfile: { url: 'ws://127.0.0.1:8899', token: 'pairing-for-agent' },
      },
    });
    render(<Editor />);
    fireEvent.click(screen.getByText('AI'));
    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
    await accept(SocketMock.instances[0]);

    fireEvent.click(screen.getByText('Change'));
    fireEvent.click(screen.getByText(/^OpenAI API/));

    await waitFor(() => expect(SocketMock.instances).toHaveLength(2));
    const next = SocketMock.instances[1];
    act(() => { next.readyState = 1; next.onopen?.(new Event('open')); });
    expect(sessionStart(next)).toMatchObject({ token: 'openai-pairing', preferredProvider: 'openai' });
    expect(useAppStore.getState().aiBridgeSettings).toMatchObject({ agentOnly: false, agentProfile: { token: 'pairing-for-agent' } });
  });
});

/**
 * The session waits for the chat to be opened, because without it nobody can
 * decide on a proposal. An author who let an agent of their own in asked for
 * the agent to reach the editor — after a reload as well, with no tab to click.
 */
describe('when the session starts', () => {
  beforeEach(() => {
    SocketMock.instances = [];
    vi.stubGlobal('WebSocket', SocketMock);
    const record = scene();
    useAppStore.setState({
      storiesMetadata: [metadata],
      sceneRecordsByStory: { 'story-1': { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      settings: normalizeUserSettings({}),
      updateSettings: changeSettings,
      aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'token', disabled: false },
    });
    useAiChatStore.setState({ messagesByStory: {}, messages: [], status: 'idle', pendingInteraction: null, appliedChangesByStory: {}, appliedChanges: [], lastAppliedChange: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ aiBridgeSettings: { url: '', token: '', disabled: false }, settings: normalizeUserSettings({}) });
  });

  it('is with the editor for an author who has let an agent in', async () => {
    useAppStore.setState({ settings: normalizeUserSettings({ externalAgentAccess: 'read' }) });

    render(<Editor />);

    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
  });

  it('is with the first opening of the chat for an author who has not', async () => {
    render(<Editor />);
    await act(async () => { await Promise.resolve(); });

    expect(SocketMock.instances).toHaveLength(0);
  });

  it('is at once when the author lets an agent in with the editor already open', async () => {
    render(<Editor />);
    await act(async () => { await Promise.resolve(); });
    expect(SocketMock.instances).toHaveLength(0);

    act(() => {
      useAppStore.setState({ settings: normalizeUserSettings({ externalAgentAccess: 'propose' }) });
    });
    // Nothing above re-reads the settings in these tests; opening the inspector's sibling does.
    fireEvent.click(screen.getByText('AI'));

    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
  });
});

describe('whether a call from an external agent may go ahead', () => {
  const open = { access: 'propose' as const, hasApprovalSurface: true, interactionPending: false };

  it('lets a read through at read and at propose, and nothing through at off', () => {
    expect(externalCallRefusal('get_scene', { ...open, access: 'read' })).toBeNull();
    expect(externalCallRefusal('get_scene', open)).toBeNull();
    expect(externalCallRefusal('get_scene', { ...open, access: 'off' })).toBe(EXTERNAL_ACCESS_OFF);
    expect(externalCallRefusal('propose_scene_patch', { ...open, access: 'off' })).toBe(EXTERNAL_ACCESS_OFF);
  });

  it('lets a read through with no surface and with a card up: reading needs nobody to look', () => {
    expect(externalCallRefusal('list_scenes', { access: 'read', hasApprovalSurface: false, interactionPending: true })).toBeNull();
  });

  it('gives each refusal of a proposal its own reason', () => {
    const reason = (editor: Parameters<typeof externalCallRefusal>[1]) => {
      const refusal = externalCallRefusal('propose_changeset', editor);
      return refusal && !refusal.ok ? (refusal.details as { reason: string }).reason : null;
    };
    expect(reason(open)).toBeNull();
    expect(reason({ ...open, access: 'read' })).toBe('EXTERNAL_PROPOSALS_OFF');
    expect(reason({ ...open, hasApprovalSurface: false })).toBe('NO_APPROVAL_SURFACE');
    expect(reason({ ...open, interactionPending: true })).toBe('INTERACTION_PENDING');
  });

  it('refuses every tool the registry does not offer outside', () => {
    for (const name of ['authorize_capability', 'get_image_binary', 'remove_background', 'generate_image', 'edit_image', 'no_such_tool']) {
      const refusal = externalCallRefusal(name, open);
      expect(refusal && !refusal.ok ? (refusal.details as { reason: string }).reason : null, name).toBe('TOOL_NOT_EXTERNAL');
    }
  });
});

describe('the external agent’s switch among the settings', () => {
  it('is off where nothing was saved, and for anything that is not one of its three values', () => {
    expect(normalizeUserSettings({}).externalAgentAccess).toBe('off');
    expect(normalizeUserSettings({ externalAgentAccess: 'everything' as never }).externalAgentAccess).toBe('off');
    expect(normalizeUserSettings({ externalAgentAccess: 'propose' }).externalAgentAccess).toBe('propose');
  });

  // A record written before the switch existed normalizes to off, and must not
  // lock out an agent the author has since let in.
  it('is not reset by a record that predates it', () => {
    const current = normalizeUserSettings({ externalAgentAccess: 'read' });

    expect(mergeLegacyUserSettings({ bgmVolume: 0.2 }, current).externalAgentAccess).toBe('read');
    expect(mergeLegacyUserSettings({ externalAgentAccess: 'off' }, current).externalAgentAccess).toBe('off');
  });
});
