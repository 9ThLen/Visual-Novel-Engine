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

function Editor({ approvalSurface, barrier = passes }: { approvalSurface?: boolean; barrier?: () => Promise<boolean> }) {
  return (
    <AiBridgeSessionProvider storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={barrier} approvalSurface={approvalSurface}>
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
