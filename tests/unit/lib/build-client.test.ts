import { BuildClient } from '@/lib/release/build-client';
import { BUILD_PROTOCOL_VERSION } from '@/lib/release/build-protocol';
import type { BuildJobSummary } from '@/lib/release/build-job';
import type { BuildRequest } from '@/lib/release/build-request';

class ControlledSocket {
  onopen: WebSocket['onopen'] = null;
  onclose: WebSocket['onclose'] = null;
  onerror: WebSocket['onerror'] = null;
  onmessage: WebSocket['onmessage'] = null;
  readonly sent: string[] = [];

  send(frame: string): void {
    this.sent.push(frame);
  }

  close(): void {
    this.onclose?.call(this as unknown as WebSocket, { reason: 'closed' } as CloseEvent);
  }

  open(): void {
    this.onopen?.call(this as unknown as WebSocket, {} as Event);
  }

  receive(message: unknown): void {
    this.onmessage?.call(
      this as unknown as WebSocket,
      { data: JSON.stringify(message) } as MessageEvent,
    );
  }

  disconnect(reason = 'network lost'): void {
    this.onclose?.call(this as unknown as WebSocket, { reason } as CloseEvent);
  }

  fail(): void {
    this.onerror?.call(this as unknown as WebSocket, {} as Event);
  }
}

const request: BuildRequest = {
  requestId: 'req_one',
  releaseId: 'release_one',
  target: 'apk',
  versionCode: 1,
  payloadHash: 'a'.repeat(64),
};

const summary: BuildJobSummary = {
  requestId: request.requestId,
  releaseId: request.releaseId,
  target: request.target,
  state: 'queued',
  attempt: 1,
  updatedAt: '2026-08-30T10:00:00.000Z',
};

function sentTypes(socket: ControlledSocket): string[] {
  return socket.sent.map((frame) => JSON.parse(frame).type as string);
}

describe('BuildClient reconnects', () => {
  const sockets: ControlledSocket[] = [];
  let client: BuildClient;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets.length = 0;
    client = new BuildClient({
      endpoint: 'http://127.0.0.1:8790',
      token: 'paired',
      onMessage: () => {},
      reconnectDelayMs: 10,
      maxReconnectDelayMs: 40,
      createSocket: () => {
        const socket = new ControlledSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });
  });

  afterEach(() => {
    client.close();
    vi.useRealTimers();
  });

  async function connect(socketIndex = 0): Promise<void> {
    const connecting = client.connect();
    sockets[socketIndex].open();
    expect(JSON.parse(sockets[socketIndex].sent[0])).toMatchObject({
      type: 'hello',
      version: BUILD_PROTOCOL_VERSION,
      token: 'paired',
    });
    sockets[socketIndex].receive({ type: 'ready', version: BUILD_PROTOCOL_VERSION });
    await connecting;
  }

  it('backs off, reconnects and restores status subscriptions', async () => {
    await connect();
    client.status('req_one');
    sockets[0].disconnect();

    await vi.advanceTimersByTimeAsync(9);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);

    sockets[1].fail();
    await vi.advanceTimersByTimeAsync(19);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);

    sockets[2].open();
    sockets[2].receive({ type: 'ready', version: BUILD_PROTOCOL_VERSION });
    await Promise.resolve();

    expect(sentTypes(sockets[2])).toEqual(['hello', 'status']);
    expect(JSON.parse(sockets[2].sent[1])).toEqual({ type: 'status', requestId: 'req_one' });
  });

  it('resends an unacknowledged idempotent submit after reconnecting', async () => {
    await connect();
    const acknowledgement = client.submit(request);
    expect(sentTypes(sockets[0])).toContain('submit');
    sockets[0].disconnect();

    await vi.advanceTimersByTimeAsync(10);
    sockets[1].open();
    sockets[1].receive({ type: 'ready', version: BUILD_PROTOCOL_VERSION });
    await Promise.resolve();

    expect(sentTypes(sockets[1])).toEqual(['hello', 'submit']);
    sockets[1].receive({ type: 'progress', job: summary });
    await expect(acknowledgement).resolves.toEqual(summary);
  });

  it('queues a command issued while the reconnect is pending', async () => {
    await connect();
    sockets[0].disconnect();
    client.cancel('req_one');

    await vi.advanceTimersByTimeAsync(10);
    sockets[1].open();
    sockets[1].receive({ type: 'ready', version: BUILD_PROTOCOL_VERSION });
    await Promise.resolve();

    expect(sentTypes(sockets[1])).toEqual(['hello', 'cancel', 'status']);
  });

  it('does not reconnect after an explicit close', async () => {
    await connect();
    client.close();
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets).toHaveLength(1);
  });
});

describe('BuildClient artifact download', () => {
  it('checks the returned bytes before exposing a signed artifact', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const client = new BuildClient({
      endpoint: 'http://127.0.0.1:8790',
      token: 'paired',
      onMessage: () => {},
      fetch: async () => new Response(bytes),
    });
    const expected = {
      fileName: 'release.apk',
      bytes: bytes.byteLength,
      sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      expiresAt: '2026-09-08T10:00:00.000Z',
    };

    // Checked by content, not by `instanceof Blob`. A `Response` built here
    // yields Node's Blob while the test's global is jsdom's, and on Node 20 —
    // which is what CI runs — those are two different classes, so a perfectly
    // good artifact fails the type check. What the caller actually needs is
    // that the bytes came back intact, which is also the stronger assertion.
    const artifact = await client.downloadArtifact('req_one', expected);
    expect(artifact.size).toBe(bytes.byteLength);
    expect([...new Uint8Array(await artifact.arrayBuffer())]).toEqual([...bytes]);
    await expect(client.downloadArtifact('req_one', { ...expected, bytes: 4 }))
      .rejects.toThrow('expected 4');
    await expect(client.downloadArtifact('req_one', { ...expected, sha256: 'f'.repeat(64) }))
      .rejects.toThrow('verified hash');
  });
});
