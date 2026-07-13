import { BridgeClient, type BridgeClientOptions } from '@/lib/bridge-client';
import { makeEnvelope } from '@/lib/bridge-protocol';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new Event('close') as CloseEvent);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  receive(message: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

const frame = (socket: MockWebSocket, index = 0): Record<string, unknown> =>
  JSON.parse(socket.sent[index]) as Record<string, unknown>;

describe('BridgeClient', () => {
  let options: BridgeClientOptions;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    options = {
      url: 'ws://127.0.0.1:7777',
      token: 'secret',
      onEvent: vi.fn(),
      onToolCall: vi.fn(async () => ({ ok: true as const, result: 'done' })),
      onConnectionChange: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends session_start with the token as its first frame', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    expect(frame(socket)).toMatchObject({
      type: 'session_start',
      sessionId: '',
      payload: { token: 'secret' },
    });
    client.close();
  });

  it('reconnects after heartbeat timeout with increasing backoff', () => {
    const client = new BridgeClient(options);
    client.connect();
    MockWebSocket.instances[0].open();

    vi.advanceTimersByTime(15_000);
    expect(frame(MockWebSocket.instances[0], 1)).toMatchObject({ type: 'ping' });
    vi.advanceTimersByTime(10_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(499);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1].close();
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);
    client.close();
  });

  it('requests session resume after reconnect', () => {
    const client = new BridgeClient(options);
    client.connect();
    const first = MockWebSocket.instances[0];
    first.open();
    first.receive(makeEnvelope('session_started', { sessionId: 'session-1', resumed: false }, 'session-1'));
    first.close();

    vi.advanceTimersByTime(500);
    const second = MockWebSocket.instances[1];
    second.open();
    expect(frame(second)).toMatchObject({
      type: 'session_start',
      payload: { token: 'secret', resumeSessionId: 'session-1' },
    });
    client.close();
  });

  it('buffers user messages while reconnecting and flushes them after opening', () => {
    const client = new BridgeClient(options);
    client.connect();
    const first = MockWebSocket.instances[0];
    first.open();
    first.close();
    client.sendUserMessage('queued', { scene: 2 });

    vi.advanceTimersByTime(500);
    const second = MockWebSocket.instances[1];
    second.open();
    expect(frame(second, 1)).toMatchObject({
      type: 'user_message',
      payload: { text: 'queued', context: { scene: 2 } },
    });
    client.close();
  });

  it('returns tool results with the same toolCallId', async () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive(makeEnvelope('tool_call', {
      toolCallId: 'tool-7', toolName: 'save', input: { value: 1 },
    }, 'session-1'));
    await Promise.resolve();

    expect(options.onToolCall).toHaveBeenCalledWith('tool-7', 'save', { value: 1 });
    expect(frame(socket, 1)).toMatchObject({
      type: 'tool_result',
      payload: { toolCallId: 'tool-7', ok: true, result: 'done' },
    });
    client.close();
  });

  it('stops reconnect and clears all timers on close', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.close();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    client.close();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
