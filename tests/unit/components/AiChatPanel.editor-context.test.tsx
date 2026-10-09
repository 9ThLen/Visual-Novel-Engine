/**
 * The chat tells the assistant what the author is pointing at.
 *
 * On send it asks the editor for one consistent capture — text, selection and
 * a save of that text — before anything goes out, builds the context from it
 * and sends it with the message. The model can read that same context back
 * during the turn, and the author sees, before sending, what will be shared.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AiChatPanel } from '@/components/ai-chat/AiChatPanel';
import type { EditorContextCapture, EditorContextCaptureOutcome } from '@/lib/ai/editor-context-capture';
import { computeSceneRevision } from '@/lib/ai/scene-revision';
import { makeEnvelope, type BridgeEnvelope } from '@/lib/bridge-protocol';
import { sceneRecordToDocumentScene } from '@/lib/document-editor/document-scene';
import { createTextStep } from '@/lib/engine/event-factory';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useEditorContextStore } from '@/stores/editor-context-store';
import { useAppStore } from '@/stores/use-app-store';

const step = { ...createTextStep({ content: 'Дощ почався. Він не вщухав.' }), id: 'step_rain' };

function scene(): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Library',
    description: '',
    tags: [],
    timeline: [step],
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

function selection(overrides: Partial<VNPlateSelectionState> = {}): VNPlateSelectionState {
  return {
    seq: 1,
    collapsed: false,
    text: 'Дощ почався',
    textLength: 11,
    truncated: false,
    before: '',
    after: '. Він не вщухав.',
    crossesChip: false,
    blocks: [{ id: step.id, kind: 'text', quote: 'Дощ почався', occurrence: 0 }],
    ...overrides,
  };
}

function captureOf(record: SceneRecord, state: VNPlateSelectionState | null): EditorContextCapture {
  return {
    sceneId: record.id,
    sceneSource: state ? 'selection' : 'scroll',
    document: sceneRecordToDocumentScene(record),
    selection: state,
    hasUnsavedChanges: false,
    activePathSceneIds: [record.id],
  };
}

function seedStory(record: SceneRecord) {
  useAppStore.setState({
    storiesMetadata: [metadata],
    sceneRecordsByStory: { [record.storyId]: { [record.id]: record } },
    characterLibraries: {},
    imageAssetIdsByStory: {},
    mediaLibrary: [],
  });
}

/** A bridge that has accepted the session; `sent` is what the panel put on the wire. */
function connectBridge() {
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
    start() {
      this.readyState = 1;
      this.onopen?.(new Event('open'));
      this.receive('session_started', {
        sessionId: 'session-1',
        provider: 'openai',
        capabilities: {
          chat: { supported: true },
          attachments: { supported: false, kinds: [], maxCount: 4, maxDecodedBytes: 5 * 1024 * 1024 },
        },
      });
    }
    sent(type: string): BridgeEnvelope[] {
      return this.send.mock.calls
        .map(([raw]) => JSON.parse(raw as string) as BridgeEnvelope)
        .filter((envelope) => envelope.type === type);
    }
  }
  vi.stubGlobal('WebSocket', SocketMock);
  useAppStore.setState({ aiBridgeSettings: { url: 'ws://127.0.0.1:8787', token: 'token', disabled: false } });
  return {
    async open() {
      await waitFor(() => expect(SocketMock.instances).toHaveLength(1));
      act(() => SocketMock.instances[0].start());
      await waitFor(() => expect(screen.getAllByText(/^Connected/).length).toBeGreaterThan(0));
      return SocketMock.instances[0];
    },
  };
}

function typeMessage(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Message the assistant…'), { target: { value: text } });
}

const pressSend = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }));

describe('AiChatPanel and the editor context', () => {
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
    useEditorContextStore.getState().clearStory('story-1');
    useAppStore.setState({ aiBridgeSettings: { url: '', token: '', disabled: true } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ aiBridgeSettings: { url: '', token: '', disabled: false } });
  });

  describe('on send', () => {
    it('captures first, then sends the message with the context the capture gave', async () => {
      const record = scene();
      seedStory(record);
      const bridge = connectBridge();
      const order: string[] = [];
      const capture = vi.fn(async (): Promise<EditorContextCaptureOutcome> => {
        order.push('capture');
        return { ok: true, capture: captureOf(record, selection()) };
      });
      render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} captureEditorContext={capture} />);
      const socket = await bridge.open();
      socket.send.mockImplementation((raw: string) => {
        if ((JSON.parse(raw) as BridgeEnvelope).type === 'user_message') order.push('send');
      });

      typeMessage('Rewrite this');
      pressSend();

      await waitFor(() => expect(order).toEqual(['capture', 'send']));
      expect(capture).toHaveBeenCalledWith({ save: true });
      expect(socket.sent('user_message')[0].payload).toMatchObject({
        text: 'Rewrite this',
        editorContext: {
          kind: 'fixed',
          storyId: 'story-1',
          scene: { id: 'scene-1', revision: computeSceneRevision(record), source: 'selection' },
          selection: { text: 'Дощ почався', anchors: [{ stepId: 'step_rain', match: 'exact' }] },
        },
      });
    });

    it('does not send when the open document could not be saved, and keeps what was typed', async () => {
      const record = scene();
      seedStory(record);
      const bridge = connectBridge();
      const capture = vi.fn(async (): Promise<EditorContextCaptureOutcome> => ({ ok: false }));
      render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} captureEditorContext={capture} />);
      const socket = await bridge.open();

      typeMessage('Rewrite this');
      pressSend();

      await waitFor(() => expect(screen.getByText(/so the message was not sent/)).toBeTruthy());
      expect(socket.sent('user_message')).toHaveLength(0);
      expect((screen.getByPlaceholderText('Message the assistant…') as HTMLTextAreaElement).value).toBe('Rewrite this');
    });

    // The capture is awaited before any state changes, so the button is still
    // live while it runs; only a synchronous guard keeps the second press out.
    it('sends once when the button is pressed twice while the capture is running', async () => {
      const record = scene();
      seedStory(record);
      const bridge = connectBridge();
      let finish!: (outcome: EditorContextCaptureOutcome) => void;
      const capture = vi.fn(() => new Promise<EditorContextCaptureOutcome>((resolve) => { finish = resolve; }));
      render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} captureEditorContext={capture} />);
      const socket = await bridge.open();

      typeMessage('Rewrite this');
      pressSend();
      pressSend();
      await act(async () => { finish({ ok: true, capture: captureOf(record, null) }); });

      await waitFor(() => expect(socket.sent('user_message')).toHaveLength(1));
      expect(capture).toHaveBeenCalledTimes(1);
    });

    it('talks about the scene the selection is in, not the one scrolled into view', async () => {
      const first = scene();
      const second = { ...scene(), id: 'scene-2', name: 'Cellar' };
      useAppStore.setState({
        storiesMetadata: [metadata],
        sceneRecordsByStory: { 'story-1': { [first.id]: first, [second.id]: second } },
        characterLibraries: {},
        imageAssetIdsByStory: {},
        mediaLibrary: [],
      });
      const bridge = connectBridge();
      const capture = async (): Promise<EditorContextCaptureOutcome> => ({ ok: true, capture: captureOf(second, selection()) });
      render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} captureEditorContext={capture} />);
      const socket = await bridge.open();

      typeMessage('Rewrite this');
      pressSend();

      await waitFor(() => expect(socket.sent('user_message')).toHaveLength(1));
      expect(socket.sent('user_message')[0].payload).toMatchObject({ editorContext: { scene: { id: 'scene-2', name: 'Cellar' } } });
    });

    it('keeps a few words about what the message pointed at, not the context itself', async () => {
      const record = scene();
      seedStory(record);
      const capture = async (): Promise<EditorContextCaptureOutcome> => ({ ok: true, capture: captureOf(record, selection()) });
      render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} captureEditorContext={capture} />);

      typeMessage('What is this about?');
      pressSend();

      await waitFor(() => expect(screen.getByText('↳ «Дощ почався» in “Library”')).toBeTruthy());
      const [message] = useAiChatStore.getState().messagesByStory['story-1'];
      expect(message).toMatchObject({ role: 'user', text: 'What is this about?', contextLabel: '«Дощ почався» in “Library”' });
      expect(message).not.toHaveProperty('editorContext');
    });

    it('works as before where there is no editor to read', async () => {
      const record = scene();
      seedStory(record);
      const bridge = connectBridge();
      render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} />);
      const socket = await bridge.open();

      typeMessage('Hello');
      pressSend();

      await waitFor(() => expect(socket.sent('user_message')).toHaveLength(1));
      expect(socket.sent('user_message')[0].payload).toEqual({ text: 'Hello' });
    });
  });

  describe('get_editor_context', () => {
    async function sendWithSelection(capture: ReturnType<typeof vi.fn>) {
      const record = scene();
      seedStory(record);
      const bridge = connectBridge();
      render(<AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} captureEditorContext={capture} />);
      const socket = await bridge.open();
      typeMessage('Rewrite this');
      pressSend();
      await waitFor(() => expect(socket.sent('user_message')).toHaveLength(1));
      return { record, socket };
    }

    const askTool = async (socket: { receive: (type: 'tool_call', payload: unknown) => void; sent: (type: string) => BridgeEnvelope[] }, toolCallId: string, input: unknown) => {
      act(() => socket.receive('tool_call', { toolCallId, toolName: 'get_editor_context', input }));
      await waitFor(() => expect(socket.sent('tool_result').some((envelope) => (envelope.payload as { toolCallId: string }).toolCallId === toolCallId)).toBe(true));
      return socket.sent('tool_result').find((envelope) => (envelope.payload as { toolCallId: string }).toolCallId === toolCallId)!.payload as {
        ok: boolean; result: { context: Record<string, unknown> | null; hint?: string };
      };
    };

    it('gives back the context that went out with the message, even after the author selects something else', async () => {
      const capture = vi.fn(async (): Promise<EditorContextCaptureOutcome> => ({ ok: true, capture: captureOf(scene(), selection()) }));
      const { socket } = await sendWithSelection(capture);
      useEditorContextStore.getState().reportSelection('story-1', 'scene-1', selection({ seq: 9, text: 'Він не вщухав' }));

      const reply = await askTool(socket, 'call-1', {});

      expect(reply).toMatchObject({ ok: true, result: { context: { kind: 'fixed', selection: { text: 'Дощ почався' } } } });
      expect(capture).toHaveBeenCalledTimes(1);
    });

    // Its addresses held for one revision of the scene.
    it('stops offering that context once its scene has changed', async () => {
      const capture = vi.fn(async (): Promise<EditorContextCaptureOutcome> => ({ ok: true, capture: captureOf(scene(), selection()) }));
      const { record, socket } = await sendWithSelection(capture);
      useAppStore.setState({
        sceneRecordsByStory: { 'story-1': { 'scene-1': { ...record, timeline: [{ ...createTextStep({ content: 'Сніг.' }), id: step.id }] } } },
      });

      const reply = await askTool(socket, 'call-1', {});

      expect(reply.result.context).toBeNull();
      expect(reply.result.hint).toMatch(/scene changed/);
    });

    it('reads the editor as it is now on request, without saving', async () => {
      const capture = vi.fn(async (options: { save: boolean }): Promise<EditorContextCaptureOutcome> => ({
        ok: true,
        capture: {
          ...captureOf(scene(), selection(options.save ? {} : { text: 'Він не вщухав', blocks: [{ id: step.id, kind: 'text', quote: 'Він не вщухав', occurrence: 0 }] })),
          hasUnsavedChanges: !options.save,
        },
      }));
      const { socket } = await sendWithSelection(capture);

      const reply = await askTool(socket, 'call-1', { mode: 'live' });

      expect(capture).toHaveBeenLastCalledWith({ save: false });
      expect(reply).toMatchObject({
        ok: true,
        result: { context: { kind: 'live', hasUnsavedChanges: true, selection: { text: 'Він не вщухав' } } },
      });
    });

    it('has no fixed context once the turn is over', async () => {
      const capture = vi.fn(async (): Promise<EditorContextCaptureOutcome> => ({ ok: true, capture: captureOf(scene(), selection()) }));
      const { socket } = await sendWithSelection(capture);
      act(() => socket.receive('assistant_done', { stopReason: 'end_turn' }));

      const reply = await askTool(socket, 'call-1', {});

      expect(reply.result.context).toBeNull();
    });
  });

  describe('the chip above the composer', () => {
    const renderPanel = () => render(
      <AiChatPanel storyId="story-1" activeSceneId="scene-1" beforeStoryMutation={async () => true} captureEditorContext={async () => ({ ok: false })} />,
    );

    beforeEach(() => seedStory(scene()));

    it('shows the selected text, how much of it there is, and where', () => {
      renderPanel();
      act(() => useEditorContextStore.getState().reportSelection('story-1', 'scene-1', selection()));

      expect(screen.getByText('«Дощ почався»')).toBeTruthy();
      expect(screen.getByText(/Selected text in “Library”/)).toBeTruthy();
      expect(screen.getByText(/Words: 2/)).toBeTruthy();
    });

    it('names the block in hand and what the author is doing with it', () => {
      renderPanel();
      act(() => useEditorContextStore.getState().reportSelection('story-1', 'scene-1', selection({
        collapsed: true, text: '', textLength: 0, blocks: [],
        focus: { id: 'step_bg', kind: 'technical', command: 'background', state: 'editing' },
      })));

      expect(screen.getByText(/Block: Background in “Library”/)).toBeTruthy();
      expect(screen.getByText(/settings open/)).toBeTruthy();
    });

    it('stays out of the way for a bare caret', () => {
      renderPanel();
      act(() => useEditorContextStore.getState().reportSelection('story-1', 'scene-1', selection({ collapsed: true, text: '', textLength: 0 })));

      expect(screen.queryByRole('button', { name: 'Do not send this to the assistant' })).toBeNull();
    });

    it('goes away when dismissed and comes back for a new selection', () => {
      renderPanel();
      act(() => useEditorContextStore.getState().reportSelection('story-1', 'scene-1', selection()));

      fireEvent.click(screen.getByRole('button', { name: 'Do not send this to the assistant' }));
      expect(screen.queryByText('«Дощ почався»')).toBeNull();

      act(() => useEditorContextStore.getState().reportSelection('story-1', 'scene-1', selection({ seq: 2, text: 'Він не вщухав' })));
      expect(screen.getByText('«Він не вщухав»')).toBeTruthy();
    });

    it('ignores a selection made in another story', () => {
      renderPanel();
      act(() => useEditorContextStore.getState().reportSelection('story-2', 'scene-1', selection()));

      expect(screen.queryByText('«Дощ почався»')).toBeNull();
      act(() => useEditorContextStore.getState().clearStory('story-2'));
    });
  });
});
