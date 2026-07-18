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

  fail(): void {
    this.onerror?.(new Event('error'));
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
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
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
    options.locale = 'uk';
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    expect(frame(socket)).toMatchObject({
      type: 'session_start',
      sessionId: '',
      payload: { token: 'secret', context: { locale: 'uk' } },
    });
    client.close();
  });

  it('reports connected only after the authenticated session starts', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    expect(options.onConnectionChange).not.toHaveBeenCalledWith('connected');
    socket.receive(makeEnvelope('session_started', { sessionId: 'session-1', resumed: false, provider: 'codex' }, 'session-1'));
    expect(options.onConnectionChange).toHaveBeenLastCalledWith('connected');
    client.close();
  });

  it('acknowledges a processed image result with its delivery id', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive(makeEnvelope('session_started', { sessionId: 'session-1', resumed: false, provider: 'codex' }, 'session-1'));
    client.acknowledgeImageResult('image-request-1');
    expect(frame(socket, 1)).toMatchObject({ type: 'image_result_ack', payload: { requestId: 'image-request-1' }, sessionId: 'session-1' });
    client.close();
  });

  it('halts reconnects after an unauthorized response', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive(makeEnvelope('error', { code: 'UNAUTHORIZED', message: 'Invalid bridge token' }));
    expect(options.onConnectionChange).toHaveBeenCalledWith('unauthorized', 'INVALID_TOKEN');
    expect(options.onEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    client.close();
  });

  it('halts reconnects and consumes another-active-session errors', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive(makeEnvelope('error', {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Another session is already active',
      details: { reason: 'SESSION_ALREADY_ACTIVE' },
    }));

    expect(options.onConnectionChange).toHaveBeenLastCalledWith('error', 'SESSION_ALREADY_ACTIVE');
    expect(options.onEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    client.close();
  });

  it('halts reconnects and consumes protocol-version mismatches', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive(makeEnvelope('error', {
      code: 'PROTOCOL_ERROR',
      message: 'Unsupported protocol version',
    }));

    expect(options.onConnectionChange).toHaveBeenLastCalledWith('error', 'PROTOCOL_VERSION_MISMATCH');
    expect(options.onEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    client.close();
  });

  it('halts reconnects when a server frame uses another protocol version', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive({
      protocolVersion: 999,
      requestId: 'request-1',
      sessionId: '',
      type: 'status',
      payload: {},
    });

    expect(options.onConnectionChange).toHaveBeenLastCalledWith('error', 'PROTOCOL_VERSION_MISMATCH');
    expect(options.onEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    client.close();
  });

  it('reports socket failures with a structured reason and still reconnects', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.fail();
    socket.close();

    expect(options.onConnectionChange).toHaveBeenCalledWith('error', 'CONNECTION_FAILED_OR_ORIGIN');
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances).toHaveLength(2);
    client.close();
  });

  it('reconnects after heartbeat timeout with increasing backoff', () => {
    const client = new BridgeClient(options);
    client.connect();
    MockWebSocket.instances[0].open();
    MockWebSocket.instances[0].receive(makeEnvelope('session_started', { sessionId: 'session-1', resumed: false, provider: 'claude' }, 'session-1'));

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

  it('resumes a persisted same-url session and ignores another URL', () => {
    const storage = sessionStorage as unknown as { getItem: ReturnType<typeof vi.fn> };
    storage.getItem.mockImplementation((key: string) => key === 'vne-bridge-session:ws://127.0.0.1:7777' ? 'persisted-1' : 'foreign');
    const client = new BridgeClient(options); client.connect(); MockWebSocket.instances[0].open();
    expect(frame(MockWebSocket.instances[0])).toMatchObject({ payload: { resumeSessionId: 'persisted-1' } });
    client.close();
  });

  it('connects when sessionStorage throws', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => { throw new Error('denied'); }),
      setItem: vi.fn(() => { throw new Error('denied'); }),
      removeItem: vi.fn(() => { throw new Error('denied'); }),
    });
    const client = new BridgeClient(options); client.connect(); MockWebSocket.instances[0].open();
    expect(frame(MockWebSocket.instances[0])).toMatchObject({ type: 'session_start', payload: { token: 'secret' } });
    expect(() => client.close()).not.toThrow();
  });

  it('sends session_end and clears the resumable session before closing', () => {
    const storage = sessionStorage as unknown as {
      setItem: ReturnType<typeof vi.fn>;
      removeItem: ReturnType<typeof vi.fn>;
    };
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive(makeEnvelope('session_started', { sessionId: 'session-1', resumed: false }, 'session-1'));
    client.close();

    expect(frame(socket, 1)).toMatchObject({ type: 'session_end' });
    expect(storage.setItem).toHaveBeenCalledWith('vne-bridge-session:ws://127.0.0.1:7777', 'session-1');
    expect(storage.removeItem).toHaveBeenCalledWith('vne-bridge-session:ws://127.0.0.1:7777');

    client.connect();
    MockWebSocket.instances[1].open();
    expect(frame(MockWebSocket.instances[1])).toMatchObject({ payload: { token: 'secret' } });
  });

  it('can clear a persisted session for one URL', () => {
    const storage = sessionStorage as unknown as { removeItem: ReturnType<typeof vi.fn> };
    BridgeClient.clearPersistedSession('ws://localhost:8787');
    expect(storage.removeItem).toHaveBeenCalledWith('vne-bridge-session:ws://localhost:8787');
  });

  it('rejects user messages until the session is authenticated', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    expect(client.sendUserMessage('too-early')).toEqual({ ok: false, reason: 'NOT_AUTHENTICATED' });
    socket.open();
    expect(client.sendUserMessage('still-too-early')).toEqual({ ok: false, reason: 'NOT_AUTHENTICATED' });
    expect(socket.sent).toHaveLength(1);

    socket.receive(makeEnvelope('session_started', { sessionId: 'session-1', resumed: false, provider: 'claude' }, 'session-1'));
    expect(client.sendUserMessage('delivered')).toEqual({ ok: true });
    expect(frame(socket, 1)).toMatchObject({
      type: 'user_message',
      payload: { text: 'delivered' },
    });
    client.close();
  });

  it('never delivers a stale turn after invalid-token reconnect', () => {
    const client = new BridgeClient(options);
    client.connect();
    const first = MockWebSocket.instances[0];
    first.open();
    expect(client.sendUserMessage('stale')).toEqual({ ok: false, reason: 'NOT_AUTHENTICATED' });
    first.receive(makeEnvelope('error', { code: 'UNAUTHORIZED', message: 'Invalid bridge token' }));

    client.connect();
    const second = MockWebSocket.instances[1];
    second.open();
    second.receive(makeEnvelope('session_started', { sessionId: 'session-2', resumed: false, provider: 'claude' }, 'session-2'));
    expect(second.sent).toHaveLength(1);
    client.close();
  });

  it('reports an oversized attachment frame instead of silently dropping it', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive(makeEnvelope('session_started', { sessionId: 'session-1', resumed: false, provider: 'claude' }, 'session-1'));
    expect(client.sendUserMessage('', [{
      id: 'a', name: 'a.pdf', kind: 'pdf', mimeType: 'application/pdf', byteSize: 7_000_000, base64: 'x'.repeat(8_000_000),
    }])).toEqual({ ok: false, reason: 'MESSAGE_TOO_LARGE' });
    expect(socket.sent).toHaveLength(1);
    client.close();
  });

  it('emits one interrupt only after authentication', () => {
    const client = new BridgeClient(options);
    client.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    expect(client.interrupt()).toEqual({ ok: false, reason: 'NOT_AUTHENTICATED' });
    socket.receive(makeEnvelope('session_started', { sessionId: 'session-1', resumed: false, provider: 'claude' }, 'session-1'));
    expect(client.interrupt()).toEqual({ ok: true });
    expect(frame(socket, 1)).toMatchObject({ type: 'interrupt', payload: {} });
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

    expect(options.onToolCall).toHaveBeenCalledWith('tool-7', 'save', { value: 1 }, { untrustedAttachmentMode: false });
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
