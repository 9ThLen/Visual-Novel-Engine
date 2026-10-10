/**
 * The assistant's session is held by the editor, above the rail.
 *
 * It used to live in the chat panel, which the rail unmounts when the author
 * switches to the inspector: the connection went with it, and so did any
 * proposal still waiting for a decision.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AiBridgeSessionProvider } from '@/components/ai-chat/AiBridgeSessionProvider';
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

function Editor({ storyId = 'story-1' }: { storyId?: string }) {
  return (
    <AiBridgeSessionProvider storyId={storyId} activeSceneId="scene-1" beforeStoryMutation={async () => true}>
      <DocumentRightRail
        scene={null}
        storyId={storyId}
        activeSceneId="scene-1"
        characters={[]}
        storyScenes={[]}
        beforeStoryMutation={async () => true}
        captureEditorContext={async () => ({ ok: false })}
      />
    </AiBridgeSessionProvider>
  );
}

const openTab = (name: 'AI' | 'Inspector') => fireEvent.click(screen.getByText(name));

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

async function propose(socket: SocketMock, record: SceneRecord) {
  const patch: AiScenePatch = {
    storyId: record.storyId,
    sceneId: record.id,
    expectedRevision: computeSceneRevision(record),
    explanation: 'Describe the scene',
    operations: [{ op: 'update_scene_metadata', updates: { description: 'Written by the assistant' } }],
  };
  act(() => socket.receive('tool_call', { toolCallId: 'call-1', toolName: 'propose_scene_patch', input: { patch }, origin: 'chat', ttlMs: 600_000 }));
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
      createStorySnapshot: vi.fn(async () => ({ id: 'snap-1', name: 'AI', createdAt: 1, sceneCount: 1, words: 0, automatic: true })),
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
    fireEvent.change(screen.getByPlaceholderText('Message the assistant…'), { target: { value: 'Half a thought' } });

    openTab('Inspector');
    openTab('AI');

    expect((screen.getByPlaceholderText('Message the assistant…') as HTMLInputElement).value).toBe('Half a thought');
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
