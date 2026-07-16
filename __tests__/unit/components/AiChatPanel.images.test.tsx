import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import { AiChatPanel } from '@/components/ai-chat/AiChatPanel';
import { defaultAiPermissions } from '@/lib/ai/permissions';
import { defaultUserSettings } from '@/lib/user-settings';
import { makeEnvelope } from '@/lib/bridge-protocol';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';

class SocketMock {
  static instances: SocketMock[] = [];
  static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSED = 3;
  readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) { SocketMock.instances.push(this); }
  send(raw: string) { this.sent.push(raw); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(new Event('open')); }
  receive(message: unknown) { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) })); }
}

describe('AiChatPanel image delivery', () => {
  beforeEach(() => {
    SocketMock.instances = [];
    vi.stubGlobal('WebSocket', SocketMock);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:ai-result') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    useAiChatStore.setState({ messages: [], messagesByStory: {}, status: 'idle', restoredStoryIds: {} });
    useAppStore.setState({
      aiBridgeSettings: { url: 'ws://localhost:8787', token: 'token', disabled: false },
      settings: { ...defaultUserSettings, aiPermissions: defaultAiPermissions },
      storiesMetadata: [], sceneRecordsByStory: {}, characterLibraries: {}, imageAssetIdsByStory: {}, mediaLibrary: [],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('dedupes redelivery, acknowledges every delivery, and persists no base64', async () => {
    const view = render(<AiChatPanel storyId="story-1" activeSceneId={null} />);
    const socket = SocketMock.instances[0];
    act(() => socket.open());
    act(() => socket.receive(makeEnvelope('session_started', { sessionId: 'session-1', resumed: false, provider: 'codex' }, 'session-1')));
    const payload = { requestId: 'image-1', purpose: 'generated', prompt: 'One castle', mimeType: 'image/png', base64: 'YWJj' };
    act(() => { socket.receive(makeEnvelope('image_result', payload, 'session-1')); socket.receive(makeEnvelope('image_result', payload, 'session-1')); });
    await waitFor(() => expect(screen.getAllByText('One castle')).toHaveLength(1));
    const acks = socket.sent.map(raw => JSON.parse(raw)).filter(frame => frame.type === 'image_result_ack');
    expect(acks).toHaveLength(2);
    expect(acks[0].payload).toEqual({ requestId: 'image-1' });
    expect(JSON.stringify(useAiChatStore.getState().messagesByStory)).not.toContain('YWJj');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ai-result');
  });
});
