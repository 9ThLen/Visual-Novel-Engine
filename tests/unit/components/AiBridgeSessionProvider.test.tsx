/**
 * The assistant's session is held above the editors, one for all of them.
 *
 * It used to live in the chat panel, which the rail unmounts when the author
 * switches to the inspector: the connection went with it, and so did any
 * proposal still waiting for a decision. Then it lived in each editor, and two
 * editors stacked on one another fought over the same session at the bridge.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { AiBridgeSessionHost, AiBridgeSessionProvider, placeOpenEditor } from '@/components/ai-chat/AiBridgeSessionProvider';
import { defaultAiPermissions } from '@/lib/ai/permissions';
import { DocumentRightRail } from '@/components/document-editor/DocumentRightRail';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { makeEnvelope, type BridgeEnvelope } from '@/lib/bridge-protocol';
import { createTextStep } from '@/lib/engine/event-factory';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';

function scene(storyId = 'story-1'): SceneRecord {
  return {
    id: 'scene-1',
    storyId,
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

const metadata = (id: string): StoryMetadata => ({ id, title: id, startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 1 });

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
  sent(type: string): Record<string, unknown>[] {
    return this.send.mock.calls
      .map(([raw]) => JSON.parse(raw as string) as BridgeEnvelope)
      .filter(envelope => envelope.type === type)
      .map(envelope => envelope.payload as Record<string, unknown>);
  }
}

const passes = async () => true;

function Editor({ storyId = 'story-1', barrier = passes, focused }: {
  storyId?: string;
  barrier?: () => Promise<boolean>;
  focused?: boolean;
}) {
  return (
    <AiBridgeSessionProvider storyId={storyId} activeSceneId="scene-1" beforeStoryMutation={barrier} focused={focused}>
      <DocumentRightRail
        scene={null}
        storyId={storyId}
        activeSceneId="scene-1"
        characters={[]}
        storyScenes={[]}
        beforeStoryMutation={barrier}
        captureEditorContext={async () => ({ ok: false })}
      />
    </AiBridgeSessionProvider>
  );
}

interface Screen { name: string; storyId?: string; barrier?: () => Promise<boolean> }

/** Editor screens as the navigator keeps them: all mounted, the last one in front. */
function Stack({ screens }: { screens: Screen[] }) {
  return (
    <AiBridgeSessionHost>
      {screens.map((item, index) => (
        <div key={item.name} data-testid={item.name}>
          <Editor storyId={item.storyId} barrier={item.barrier} focused={index === screens.length - 1} />
        </div>
      ))}
    </AiBridgeSessionHost>
  );
}

const openTab = (name: 'AI' | 'Inspector') => fireEvent.click(screen.getByText(name));
const on = (name: string) => within(screen.getByTestId(name));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

const snapshotRecord = { id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true };
const systemMessages = () => (useAiChatStore.getState().messagesByStory['story-1'] ?? [])
  .filter(message => message.role === 'system')
  .map(message => message.text);
const composer = () => screen.getByPlaceholderText('Message the assistant…') as HTMLInputElement;

async function connect() {
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
}

function patchFor(record: SceneRecord): AiScenePatch {
  return {
    storyId: record.storyId,
    sceneId: record.id,
    expectedRevision: computeSceneRevision(record),
    explanation: 'Describe the scene',
    operations: [{ op: 'update_scene_metadata', updates: { description: 'Written by the assistant' } }],
  };
}

async function propose(socket: SocketMock, record: SceneRecord) {
  act(() => socket.receive('tool_call', { toolCallId: 'call-1', toolName: 'propose_scene_patch', input: { patch: patchFor(record) }, origin: 'chat', ttlMs: 600_000 }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy());
}

describe('the assistant’s session, held by the editor', () => {
  let saveSceneRecord: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    SocketMock.instances = [];
    vi.stubGlobal('WebSocket', SocketMock);
    saveSceneRecord = vi.fn();
    const record = scene();
    useAppStore.setState({
      storiesMetadata: [metadata('story-1'), metadata('story-2')],
      sceneRecordsByStory: { 'story-1': { [record.id]: record }, 'story-2': { [record.id]: scene('story-2') } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot: vi.fn(async () => snapshotRecord),
      saveSceneRecord,
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
    useAppStore.setState({ aiBridgeSettings: { url: '', token: '', disabled: false } });
  });

  // Where the chat is never shown there is nobody to decide on a proposal.
  it('does not reach for the bridge until the chat is opened', async () => {
    render(<Editor />);
    await act(async () => { await Promise.resolve(); });
    expect(SocketMock.instances).toHaveLength(0);

    openTab('AI');

    await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
  });

  it('keeps the connection and the proposal while the author is in the inspector', async () => {
    render(<Editor />);
    openTab('AI');
    const socket = await connect();
    await propose(socket, scene());
    expect(screen.queryByTestId('ai-tab-waiting')).toBeNull();

    openTab('Inspector');

    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.sent('tool_result')).toEqual([]);
    expect(useAiChatStore.getState().pendingInteraction?.kind).toBe('scene_patch');
    // The tab the author is not looking at says something is waiting behind it.
    expect(screen.getByTestId('ai-tab-waiting')).toBeTruthy();
    expect(screen.getByLabelText(/a proposal is waiting/)).toBeTruthy();

    openTab('AI');
    expect(SocketMock.instances).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(socket.sent('tool_result')).toEqual([{ toolCallId: 'call-1', ok: true, result: { accepted: true } }]));
    expect(screen.queryByTestId('ai-tab-waiting')).toBeNull();
  });

  it('still takes a proposal down when the bridge withdraws it behind the inspector', async () => {
    render(<Editor />);
    openTab('AI');
    const socket = await connect();
    await propose(socket, scene());
    openTab('Inspector');

    act(() => socket.receive('tool_cancel', { toolCallId: 'call-1', reason: 'TURN_ENDED' }));

    await waitFor(() => expect(useAiChatStore.getState().pendingInteraction).toBeNull());
    expect(screen.queryByTestId('ai-tab-waiting')).toBeNull();
  });

  it('keeps what was typed in the composer across a visit to the inspector', async () => {
    render(<Editor />);
    openTab('AI');
    await connect();
    fireEvent.change(composer(), { target: { value: 'Half a thought' } });

    openTab('Inspector');
    openTab('AI');

    expect(composer().value).toBe('Half a thought');
  });

  // The socket was closed for the old story and nothing else was: the message
  // typed about one story was still in the composer of the next.
  it('does not carry a half-written message into another story', async () => {
    const view = render(<Editor />);
    openTab('AI');
    await connect();
    fireEvent.change(composer(), { target: { value: 'About the first story' } });

    view.rerender(<Editor storyId="story-2" />);

    await waitFor(() => expect(SocketMock.instances).toHaveLength(2));
    expect(composer().value).toBe('');
  });

  it('ends the session when the editor turns to another story', async () => {
    const view = render(<Editor />);
    openTab('AI');
    const socket = await connect();
    await propose(socket, scene());

    view.rerender(<Editor storyId="story-2" />);

    await waitFor(() => expect(socket.close).toHaveBeenCalled());
    expect(socket.sent('session_end')).toHaveLength(1);
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    expect(saveSceneRecord).not.toHaveBeenCalled();
    // And the new story gets a session of its own.
    await waitFor(() => expect(SocketMock.instances).toHaveLength(2));
  });

  it('turns down what was waiting when the editor is left', async () => {
    const view = render(<Editor />);
    openTab('AI');
    const socket = await connect();
    await propose(socket, scene());

    view.unmount();

    expect(socket.close).toHaveBeenCalled();
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    expect(saveSceneRecord).not.toHaveBeenCalled();
  });
});

/**
 * Applying waits on the way to the store — for the draft to be saved, for a
 * rollback snapshot. Leaving the editor used to forget the call instead of
 * closing it, and a change that was in one of those waits was written anyway,
 * after the bridge had been told it was turned down.
 */
describe('a change still on its way when the session ends', () => {
  let saveSceneRecord: ReturnType<typeof vi.fn>;
  let createStorySnapshot: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    SocketMock.instances = [];
    vi.stubGlobal('WebSocket', SocketMock);
    saveSceneRecord = vi.fn();
    createStorySnapshot = vi.fn(async () => snapshotRecord);
    const record = scene();
    useAppStore.setState({
      storiesMetadata: [metadata('story-1')],
      sceneRecordsByStory: { 'story-1': { [record.id]: record } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot,
      saveSceneRecord,
      settings: { ...useAppStore.getState().settings, aiPermissions: { ...defaultAiPermissions } },
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
    useAppStore.setState({
      aiBridgeSettings: { url: '', token: '', disabled: false },
      settings: { ...useAppStore.getState().settings, aiPermissions: { ...defaultAiPermissions } },
    });
  });

  it('is not written when the editor is left while the snapshot is being made', async () => {
    const snapshot = deferred<typeof snapshotRecord>();
    createStorySnapshot.mockImplementation(() => snapshot.promise);
    const view = render(<Editor />);
    openTab('AI');
    const socket = await connect();
    await propose(socket, scene());
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(createStorySnapshot).toHaveBeenCalled());

    view.unmount();
    await act(async () => { snapshot.resolve(snapshotRecord); await snapshot.promise; });

    await waitFor(() => expect(systemMessages()).toContain('The session with the assistant ended before this change was written, so nothing was applied.'));
    expect(saveSceneRecord).not.toHaveBeenCalled();
    // The bridge heard that the session ended, and never that the change was applied.
    expect(socket.sent('session_end')).toHaveLength(1);
    expect(socket.sent('tool_result')).toEqual([]);
  });

  // The gate is made at the click. Made after the save, it would belong to no
  // session that could end, and let the change through.
  it('is not written when the editor is left while the draft is being saved', async () => {
    const saved = deferred<boolean>();
    const barrier = vi.fn(() => saved.promise);
    const view = render(<Editor barrier={barrier} />);
    openTab('AI');
    const socket = await connect();
    await propose(socket, scene());
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(barrier).toHaveBeenCalled());

    view.unmount();
    await act(async () => { saved.resolve(true); await saved.promise; });

    await waitFor(() => expect(systemMessages()).toContain('The session with the assistant ended before this change was written, so nothing was applied.'));
    expect(saveSceneRecord).not.toHaveBeenCalled();
  });

  it('is not written when it needed no click and the editor is left while the draft is being saved', async () => {
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, aiPermissions: { ...defaultAiPermissions, scene_edit: 'auto' } },
    });
    const saved = deferred<boolean>();
    const barrier = vi.fn(() => saved.promise);
    const view = render(<Editor barrier={barrier} />);
    openTab('AI');
    const socket = await connect();
    act(() => socket.receive('tool_call', { toolCallId: 'call-1', toolName: 'propose_scene_patch', input: { patch: patchFor(scene()) }, origin: 'chat', ttlMs: 600_000 }));
    await waitFor(() => expect(barrier).toHaveBeenCalled());

    view.unmount();
    await act(async () => { saved.resolve(true); await saved.promise; });

    await waitFor(() => expect(createStorySnapshot).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(saveSceneRecord).not.toHaveBeenCalled();
  });

  it('is not written when the bridge ends the session under it', async () => {
    const snapshot = deferred<typeof snapshotRecord>();
    createStorySnapshot.mockImplementation(() => snapshot.promise);
    render(<Editor />);
    openTab('AI');
    const socket = await connect();
    await propose(socket, scene());
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(createStorySnapshot).toHaveBeenCalled());

    act(() => socket.receive('error', { code: 'UNAUTHORIZED', message: 'Invalid bridge token' }));
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    await act(async () => { snapshot.resolve(snapshotRecord); await snapshot.promise; });

    await waitFor(() => expect(systemMessages()).toContain('The session with the assistant ended before this change was written, so nothing was applied.'));
    expect(saveSceneRecord).not.toHaveBeenCalled();
  });

  it('is written when nothing ended in the meantime', async () => {
    const snapshot = deferred<typeof snapshotRecord>();
    createStorySnapshot.mockImplementation(() => snapshot.promise);
    render(<Editor />);
    openTab('AI');
    const socket = await connect();
    await propose(socket, scene());
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(createStorySnapshot).toHaveBeenCalled());

    await act(async () => { snapshot.resolve(snapshotRecord); await snapshot.promise; });

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(socket.sent('tool_result')).toEqual([{ toolCallId: 'call-1', ok: true, result: { accepted: true } }]));
  });
});

/**
 * Opening a scene off the current path puts a second editor on top of the
 * first and leaves the first mounted. Each used to hold a session of its own;
 * both resumed the same session at the bridge and took the socket from each
 * other for as long as they were open.
 */
describe('a stack of editors, and the one session they share', () => {
  let saveSceneRecord: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    SocketMock.instances = [];
    vi.stubGlobal('WebSocket', SocketMock);
    saveSceneRecord = vi.fn();
    const record = scene();
    useAppStore.setState({
      storiesMetadata: [metadata('story-1'), metadata('story-2')],
      sceneRecordsByStory: { 'story-1': { [record.id]: record }, 'story-2': { [record.id]: scene('story-2') } },
      characterLibraries: {},
      imageAssetIdsByStory: {},
      mediaLibrary: [],
      createStorySnapshot: vi.fn(async () => snapshotRecord),
      saveSceneRecord,
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
    useAppStore.setState({ aiBridgeSettings: { url: '', token: '', disabled: false } });
  });

  it('opens no second connection when the chat is opened in the editor on top', async () => {
    const view = render(<Stack screens={[{ name: 'below' }]} />);
    fireEvent.click(on('below').getByText('AI'));
    const socket = await connect();

    view.rerender(<Stack screens={[{ name: 'below' }, { name: 'above' }]} />);
    fireEvent.click(on('above').getByText('AI'));
    await act(async () => { await Promise.resolve(); });

    expect(SocketMock.instances).toHaveLength(1);
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.sent('session_start')).toHaveLength(1);
    expect(on('above').getAllByText(/^Connected/).length).toBeGreaterThan(0);
    // One session in one pair of hands: the editor underneath draws none of it.
    expect(on('below').queryByPlaceholderText('Message the assistant…')).toBeNull();
  });

  it('keeps a proposal waiting through the move, and applies it with the top editor’s draft saved', async () => {
    const below = vi.fn(passes);
    const above = vi.fn(passes);
    const view = render(<Stack screens={[{ name: 'below', barrier: below }]} />);
    fireEvent.click(on('below').getByText('AI'));
    const socket = await connect();
    await propose(socket, scene());

    view.rerender(<Stack screens={[{ name: 'below', barrier: below }, { name: 'above', barrier: above }]} />);

    expect(socket.sent('tool_result')).toEqual([]);
    expect(on('above').getByTestId('ai-tab-waiting')).toBeTruthy();
    fireEvent.click(on('above').getByText('AI'));
    fireEvent.click(await on('above').findByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(saveSceneRecord).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(socket.sent('tool_result')).toEqual([{ toolCallId: 'call-1', ok: true, result: { accepted: true } }]));
    // The draft that has to land first is in the editor the author is looking at.
    expect(above).toHaveBeenCalledTimes(1);
    expect(below).not.toHaveBeenCalled();
    expect(SocketMock.instances).toHaveLength(1);
  });

  it('is back in the editor underneath when the one on top is closed', async () => {
    const view = render(<Stack screens={[{ name: 'below' }, { name: 'above' }]} />);
    fireEvent.click(on('below').getByText('AI'));
    fireEvent.click(on('above').getByText('AI'));
    const socket = await connect();
    fireEvent.change(composer(), { target: { value: 'Half a thought' } });

    view.rerender(<Stack screens={[{ name: 'below' }]} />);

    expect(on('below').getAllByText(/^Connected/).length).toBeGreaterThan(0);
    expect(composer().value).toBe('Half a thought');
    expect(SocketMock.instances).toHaveLength(1);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('ends when the last editor is closed', async () => {
    const view = render(<Stack screens={[{ name: 'below' }, { name: 'above' }]} />);
    fireEvent.click(on('above').getByText('AI'));
    const socket = await connect();
    await propose(socket, scene());

    view.rerender(<Stack screens={[]} />);

    expect(socket.close).toHaveBeenCalled();
    expect(socket.sent('session_end')).toHaveLength(1);
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
  });

  it('ends when an editor of another story comes to the front, and starts over for that story', async () => {
    const view = render(<Stack screens={[{ name: 'below' }]} />);
    fireEvent.click(on('below').getByText('AI'));
    const socket = await connect();
    fireEvent.change(composer(), { target: { value: 'About the first story' } });

    view.rerender(<Stack screens={[{ name: 'below' }, { name: 'above', storyId: 'story-2' }]} />);
    fireEvent.click(on('above').getByText('AI'));

    await waitFor(() => expect(socket.close).toHaveBeenCalled());
    await waitFor(() => expect(SocketMock.instances).toHaveLength(2));
    expect(composer().value).toBe('');
  });
});

describe('which editor is in front', () => {
  const editor = { storyId: 'story-1', activeSceneId: 'scene-1', beforeStoryMutation: passes };
  const a = Symbol('a');
  const b = Symbol('b');
  const front = (open: ReturnType<typeof placeOpenEditor>) => open[open.length - 1]?.id;

  it('is the one opened last', () => {
    const open = placeOpenEditor(placeOpenEditor([], { id: a, focused: true, editor }), { id: b, focused: true, editor });
    expect(front(open)).toBe(b);
  });

  it('stays the same one under a preview: nothing took its place', () => {
    let open = placeOpenEditor([], { id: a, focused: true, editor });
    open = placeOpenEditor(open, { id: b, focused: true, editor });
    open = placeOpenEditor(open, { id: a, focused: false, editor });
    open = placeOpenEditor(open, { id: b, focused: false, editor });
    expect(front(open)).toBe(b);
  });

  it('is the one the author came back to', () => {
    let open = placeOpenEditor([], { id: a, focused: true, editor });
    open = placeOpenEditor(open, { id: b, focused: true, editor });
    open = placeOpenEditor(open, { id: a, focused: false, editor });
    open = placeOpenEditor(open, { id: a, focused: true, editor });
    expect(front(open)).toBe(a);
  });

  it('does not change for an editor that only moved to another scene', () => {
    let open = placeOpenEditor([], { id: a, focused: false, editor });
    open = placeOpenEditor(open, { id: b, focused: true, editor });
    const moved = placeOpenEditor(open, { id: a, focused: false, editor: { ...editor, activeSceneId: 'scene-2' } });
    expect(front(moved)).toBe(b);
    expect(moved[0].editor.activeSceneId).toBe('scene-2');
  });

  it('gives back the same list when nothing changed', () => {
    const open = placeOpenEditor([], { id: a, focused: true, editor });
    expect(placeOpenEditor(open, { id: a, focused: true, editor })).toBe(open);
  });
});
