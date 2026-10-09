import { BridgeClient, type BridgeClientOptions, type ToolResult } from '@/lib/bridge-client';
import { makeEnvelope } from '@/lib/bridge-protocol';
import { BridgeResultQueue } from '@/lib/bridge-result-queue';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) { MockWebSocket.instances.push(this); }
  send(data: string): void { this.sent.push(data); }
  close(): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new Event('close') as CloseEvent);
  }
  open(): void { this.readyState = MockWebSocket.OPEN; this.onopen?.(new Event('open')); }
  receive(type: Parameters<typeof makeEnvelope>[0], payload: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(makeEnvelope(type, payload, 'session-1')) }));
  }
  /** What the client sent of one type, as payloads. */
  payloads(type: string): Record<string, unknown>[] {
    return this.sent.map(raw => JSON.parse(raw) as { type: string; payload: Record<string, unknown> })
      .filter(message => message.type === type).map(message => message.payload);
  }
}

/** A sessionStorage that keeps what it is given, as a reload would find it. */
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
const applied: ToolResult = { ok: true, result: { accepted: true } };
const rejected: ToolResult = { ok: true, result: { accepted: false, reason: 'rejected' } };

describe('answers to calls that waited for the author', () => {
  let storage: ReturnType<typeof memoryStorage>;
  let decide!: (result: ToolResult) => void;
  let options: BridgeClientOptions;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    MockWebSocket.instances = [];
    storage = memoryStorage();
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('sessionStorage', storage);
    options = {
      url: 'ws://127.0.0.1:7777',
      token: 'secret',
      onEvent: vi.fn(),
      onToolCall: vi.fn(() => new Promise<ToolResult>((resolve) => { decide = resolve; })),
      onToolCancel: vi.fn(),
      onConnectionChange: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function connected(client: BridgeClient, index = 0, resumed = false) {
    if (index === 0) client.connect();
    const socket = MockWebSocket.instances[index];
    socket.open();
    socket.receive('session_started', { sessionId: 'session-1', resumed });
    return socket;
  }
  const propose = (socket: MockWebSocket, toolCallId = 'call-1') => socket.receive('tool_call', {
    toolCallId, toolName: 'propose_scene_patch', input: {}, ttlMs: 600_000,
  });

  it('hands the handler the card’s lifetime, and none for a call that has none', async () => {
    const socket = connected(new BridgeClient(options));

    propose(socket);
    socket.receive('tool_call', { toolCallId: 'call-2', toolName: 'get_scene', input: {} });
    await flush();

    expect(options.onToolCall).toHaveBeenNthCalledWith(1, 'call-1', 'propose_scene_patch', {}, { untrustedAttachmentMode: false, ttlMs: 600_000 });
    expect(options.onToolCall).toHaveBeenNthCalledWith(2, 'call-2', 'get_scene', {}, { untrustedAttachmentMode: false });
  });

  it('sends an answer again after the socket comes back, until it is acknowledged', async () => {
    const client = new BridgeClient(options);
    const first = connected(client);
    propose(first);
    await flush();
    // The author decides after the socket has dropped: this answer goes nowhere.
    first.close();
    decide(applied);
    await flush();
    expect(first.payloads('tool_result')).toEqual([]);

    vi.advanceTimersByTime(500);
    const second = connected(client, 1, true);
    expect(second.payloads('tool_result')).toEqual([{ toolCallId: 'call-1', ok: true, result: { accepted: true } }]);

    // Still unacknowledged when the socket drops again: sent once more.
    second.close();
    vi.advanceTimersByTime(2_000);
    const third = connected(client, 2, true);
    expect(third.payloads('tool_result')).toHaveLength(1);

    third.receive('tool_result_ack', { toolCallId: 'call-1' });
    third.close();
    vi.advanceTimersByTime(5_000);
    expect(connected(client, 3, true).payloads('tool_result')).toEqual([]);
    client.close();
  });

  it('finds an unacknowledged answer again after a reload', async () => {
    const before = new BridgeClient(options);
    const socket = connected(before);
    propose(socket);
    await flush();
    decide(applied);
    await flush();
    expect(socket.payloads('tool_result')).toHaveLength(1);
    expect(storage.values.get('vne-bridge-session:ws://127.0.0.1:7777')).toBe('session-1');

    // A reload: nothing of the old client is left but what sessionStorage holds.
    const after = new BridgeClient(options);
    after.connect();
    const reloaded = MockWebSocket.instances[1];
    reloaded.open();
    reloaded.receive('session_started', { sessionId: 'session-1', resumed: true });

    expect(reloaded.payloads('tool_result')).toEqual([{ toolCallId: 'call-1', ok: true, result: { accepted: true } }]);
  });

  it('drops answers kept for a session that is gone', async () => {
    const client = new BridgeClient(options);
    const first = connected(client);
    propose(first);
    await flush();
    first.close();
    decide(applied);
    await flush();

    vi.advanceTimersByTime(500);
    const second = MockWebSocket.instances[1];
    second.open();
    second.receive('session_started', { sessionId: 'session-2', resumed: false });

    expect(second.payloads('tool_result')).toEqual([]);
  });

  it('does not keep what a read returned', async () => {
    const client = new BridgeClient({ ...options, onToolCall: vi.fn(async () => ({ ok: true as const, result: { id: 's1' } })) });
    const first = connected(client);
    first.receive('tool_call', { toolCallId: 'call-2', toolName: 'get_scene', input: {} });
    await flush();
    first.close();

    vi.advanceTimersByTime(500);
    expect(connected(client, 1, true).payloads('tool_result')).toEqual([]);
  });

  it('tells the app a call was withdrawn, and sends no answer for it', async () => {
    const socket = connected(new BridgeClient(options));
    propose(socket);
    await flush();

    socket.receive('tool_cancel', { toolCallId: 'call-1', reason: 'TURN_ENDED' });
    decide(rejected);
    await flush();

    expect(options.onToolCancel).toHaveBeenCalledWith('call-1', 'TURN_ENDED');
    expect(options.onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'tool_cancel' }));
    expect(socket.payloads('tool_result')).toEqual([]);
  });

  // The withdrawal crossed a write that had already happened: the bridge has
  // to learn that the change is in the story.
  it('still reports a change that was written before the withdrawal arrived', async () => {
    const socket = connected(new BridgeClient(options));
    propose(socket);
    await flush();

    socket.receive('tool_cancel', { toolCallId: 'call-1', reason: 'INTERRUPTED' });
    decide(applied);
    await flush();

    expect(socket.payloads('tool_result')).toEqual([{ toolCallId: 'call-1', ok: true, result: { accepted: true } }]);
  });

  it('forgets the kept answers when the session is ended on purpose', async () => {
    const client = new BridgeClient(options);
    const socket = connected(client);
    propose(socket);
    await flush();
    decide(applied);
    await flush();
    expect(storage.values.has('vne-bridge-results:ws://127.0.0.1:7777')).toBe(true);

    client.close();

    expect(storage.values.has('vne-bridge-results:ws://127.0.0.1:7777')).toBe(false);
  });
});

describe('BridgeResultQueue', () => {
  beforeEach(() => { vi.stubGlobal('sessionStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps answers in the order they were given and lets one go by its call', () => {
    const queue = new BridgeResultQueue('key');
    queue.adopt('session-1');
    queue.add('a', applied);
    queue.add('b', rejected);
    queue.remove('a');

    expect(queue.entries()).toEqual([['b', rejected]]);
  });

  it('holds only the most recent few', () => {
    const queue = new BridgeResultQueue('key');
    queue.adopt('session-1');
    for (let index = 0; index < 20; index += 1) queue.add(`call-${index}`, applied);

    expect(queue.entries()).toHaveLength(16);
    expect(queue.entries()[0][0]).toBe('call-4');
  });

  it('survives storage that holds something else, or throws', () => {
    sessionStorage.setItem('key', '{"sessionId":7,"items":"no"}');
    const queue = new BridgeResultQueue('key');
    queue.adopt('session-1');
    expect(queue.entries()).toEqual([]);

    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } });
    const blocked = new BridgeResultQueue('key');
    blocked.adopt('session-1');
    blocked.add('a', applied);
    expect(blocked.entries()).toEqual([['a', applied]]);
    expect(() => blocked.clear()).not.toThrow();
  });
});
