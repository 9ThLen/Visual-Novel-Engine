/**
 * The build helper, driven over real sockets against a fake builder.
 *
 * R7's acceptance is not "a build works" — no cloud account is involved — but
 * "the kernel survives abuse": a reload mid-build, a cancel, a retry, a resubmit
 * with the same idempotency key, a resubmit with the same key and a different
 * payload, an abandoned upload. Each of those is a case below, and each is
 * driven the way a browser would drive it rather than by calling methods.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

import { BuildHelperServer } from '../../../tools/build-helper/src/server';
import { FakeBuilder } from '../../../tools/build-helper/src/builder';
import { sweepAbandonedUploads } from '../../../tools/build-helper/src/upload';
import { BUILD_PROTOCOL_VERSION } from '../../../lib/release/build-protocol';
import type { BuildRequest } from '../../../lib/release/build-request';

const ORIGIN = 'http://localhost:8081';
const RELEASE_BYTES = new TextEncoder().encode('pretend this is a .vnerelease');
const PAYLOAD_HASH = createHash('sha256').update(RELEASE_BYTES).digest('hex');

function request(overrides: Partial<BuildRequest> = {}): BuildRequest {
  return {
    requestId: 'req_one',
    releaseId: 'release_1',
    target: 'apk',
    versionCode: 7,
    payloadHash: PAYLOAD_HASH,
    ...overrides,
  };
}

/** A client that records everything the helper says, the way a tab would. */
class TestClient {
  readonly messages: any[] = [];
  private constructor(private readonly socket: WebSocket) {}

  static async connect(port: number, token: string): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: ORIGIN });
    const client = new TestClient(socket);
    socket.on('message', (data) => client.messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    client.send({ type: 'hello', version: BUILD_PROTOCOL_VERSION, token });
    await client.waitFor((message) => message.type === 'ready' || message.type === 'error');
    return client;
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  async waitFor(predicate: (message: any) => boolean, timeoutMs = 4000): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(`Timed out. Saw: ${JSON.stringify(this.messages)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  close(): void {
    this.socket.close();
  }
}

async function upload(
  port: number,
  token: string,
  requestId: string,
  bytes: Uint8Array = RELEASE_BYTES,
): Promise<{ status: number; body: any }> {
  const response = await fetch(`http://127.0.0.1:${port}/build-inputs/${requestId}`, {
    method: 'POST',
    headers: { 'x-vne-build-token': token, origin: ORIGIN },
    body: bytes,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

describe('the build helper', () => {
  let workDir: string;
  let server: BuildHelperServer;
  let port: number;

  async function startServer(options: Partial<ConstructorParameters<typeof BuildHelperServer>[0]> = {}) {
    server = new BuildHelperServer({
      workDirectory: workDir,
      allowedOrigins: [ORIGIN],
      builder: new FakeBuilder(),
      ...options,
    });
    port = await server.start();
    return server;
  }

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'vne-build-'));
  });

  afterEach(async () => {
    await server?.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('takes a release and builds it', async () => {
    await startServer();
    const client = await TestClient.connect(port, server.token);

    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress' && m.job.state === 'queued');

    const uploaded = await upload(port, server.token, 'req_one');
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.sha256).toBe(PAYLOAD_HASH);

    const completed = await client.waitFor((m) => m.type === 'completed');
    expect(completed.job.state).toBe('succeeded');
    expect(completed.job.artifact.fileName).toBe('release_1-7.apk');
    expect(completed.job.artifact.bytes).toBeGreaterThan(0);
    expect(completed.job.artifact.expiresAt).toBeTruthy();

    const artifact = await fetch(`http://127.0.0.1:${port}/build-artifacts/req_one`, {
      headers: { 'x-vne-build-token': server.token, origin: ORIGIN },
    });
    expect(artifact.status).toBe(200);
    expect(artifact.headers.get('content-disposition')).toContain('release_1-7.apk');
    expect((await artifact.arrayBuffer()).byteLength).toBe(completed.job.artifact.bytes);
    client.close();
  });

  it('answers the browser upload preflight with exact CORS headers', async () => {
    await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/build-inputs/req_one`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-vne-build-token',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-headers')).toContain('x-vne-build-token');
  });

  /**
   * The reason the helper is a service with state on disk rather than an
   * adapter: a native build outlives the tab that asked for it.
   */
  it('lets a reloaded tab rejoin a build it did not start', async () => {
    await startServer({ builder: new FakeBuilder({ stepMs: 40 }) });
    const first = await TestClient.connect(port, server.token);
    first.send({ type: 'submit', request: request() });
    await first.waitFor((m) => m.type === 'progress');
    await upload(port, server.token, 'req_one');
    first.close();

    const second = await TestClient.connect(port, server.token);
    second.send({ type: 'status', requestId: 'req_one' });
    const seen = await second.waitFor((m) => m.job?.requestId === 'req_one');
    expect(['staging', 'submitted', 'building', 'verifying', 'succeeded'])
      .toContain(seen.job.state);
    second.close();
  });

  /**
   * A double click, a reconnect and a retried socket must not each start a paid
   * build. That is the whole reason the request carries an idempotency key.
   */
  it('rejoins the existing job when the same request is submitted twice', async () => {
    await startServer();
    const client = await TestClient.connect(port, server.token);

    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress');
    const before = readdirSync(path.join(workDir, 'jobs'));

    client.send({ type: 'submit', request: request() });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(readdirSync(path.join(workDir, 'jobs'))).toEqual(before);
    expect(client.messages.some((m) => m.type === 'error')).toBe(false);
    client.close();
  });

  /**
   * The same key with different bytes is not a race to resolve. Answering it
   * with the first job's artifact would attribute a build to a release it was
   * never made from.
   */
  it('refuses the same request id for a different payload', async () => {
    await startServer();
    const client = await TestClient.connect(port, server.token);

    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress');

    client.send({ type: 'submit', request: request({ payloadHash: 'b'.repeat(64) }) });
    const error = await client.waitFor((m) => m.type === 'error');
    expect(error.code).toBe('PAYLOAD_MISMATCH');
    client.close();
  });

  it('refuses an upload whose bytes are not the ones the request declared', async () => {
    await startServer();
    const client = await TestClient.connect(port, server.token);
    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress');

    const outcome = await upload(
      port,
      server.token,
      'req_one',
      new TextEncoder().encode('a different release entirely'),
    );

    expect(outcome.status).toBe(409);
    expect(outcome.body.code).toBe('PAYLOAD_MISMATCH');
    // And nothing was left behind under the name a build would look for.
    expect(existsSync(path.join(workDir, 'uploads', 'req_one.vnerelease'))).toBe(false);
    client.close();
  });

  it('will not accept an upload for a request nobody submitted', async () => {
    await startServer();
    const outcome = await upload(port, server.token, 'req_unknown');
    expect(outcome.status).toBe(404);
    expect(outcome.body.code).toBe('UNKNOWN_REQUEST');
  });

  it('refuses an upload without the pairing token', async () => {
    await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/build-inputs/req_one`, {
      method: 'POST',
      headers: { origin: ORIGIN },
      body: RELEASE_BYTES,
    });
    expect(response.status).toBe(401);
  });

  it('refuses an upload from an origin it was not paired with', async () => {
    await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/build-inputs/req_one`, {
      method: 'POST',
      headers: { 'x-vne-build-token': server.token, origin: 'https://example.test' },
      body: RELEASE_BYTES,
    });
    expect(response.status).toBe(403);
  });

  /**
   * The helper stops reading and drops the connection rather than draining a
   * runaway upload to be polite about it, so the client sees a transport error
   * rather than a status. What matters is that nothing was kept and no build
   * started — asserting on a status code here would be asserting on the shape of
   * the refusal instead of the refusal.
   */
  it('refuses a release larger than the limit and keeps none of it', async () => {
    await startServer({ maxUploadBytes: 16 });
    const client = await TestClient.connect(port, server.token);
    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress');

    const refused = await upload(port, server.token, 'req_one').then(
      (outcome) => outcome.status >= 400,
      () => true,
    );

    expect(refused).toBe(true);
    expect(existsSync(path.join(workDir, 'uploads', 'req_one.vnerelease'))).toBe(false);
    expect(existsSync(path.join(workDir, 'uploads', 'req_one.vnerelease.part'))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(client.messages.some((m) => m.job?.state === 'building')).toBe(false);
    client.close();
  });

  it('cancels a running build and says so', async () => {
    await startServer({ builder: new FakeBuilder({ stepMs: 60 }) });
    const client = await TestClient.connect(port, server.token);
    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress');
    await upload(port, server.token, 'req_one');
    await client.waitFor((m) => m.job?.state === 'building' || m.job?.state === 'submitted');

    client.send({ type: 'cancel', requestId: 'req_one' });
    const failed = await client.waitFor((m) => m.type === 'failed' && m.job.state === 'cancelled');
    expect(failed.job.state).toBe('cancelled');
    client.close();
  });

  // The archive is already on disk, so a retry does not ask the author to send
  // a release they have sent once already.
  it('retries a failed build without a second upload', async () => {
    await startServer({ builder: new FakeBuilder({ failAfterSteps: 1 }) });
    const client = await TestClient.connect(port, server.token);
    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress');
    await upload(port, server.token, 'req_one');
    await client.waitFor((m) => m.type === 'failed' && m.job.state === 'failed');

    client.send({ type: 'retry', requestId: 'req_one' });
    const retried = await client.waitFor((m) => m.job?.attempt === 2);
    expect(retried.job.attempt).toBe(2);
    client.close();
  });

  it('refuses to retry a build that is still running', async () => {
    await startServer({ builder: new FakeBuilder({ stepMs: 60 }) });
    const client = await TestClient.connect(port, server.token);
    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress');
    await upload(port, server.token, 'req_one');

    client.send({ type: 'retry', requestId: 'req_one' });
    const error = await client.waitFor((m) => m.type === 'error');
    expect(error.code).toBe('NOT_RETRYABLE');
    client.close();
  });

  it('reports a build that produced nothing as a failure, with a reason', async () => {
    await startServer({ builder: new FakeBuilder({ failAfterSteps: 0 }) });
    const client = await TestClient.connect(port, server.token);
    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress');
    await upload(port, server.token, 'req_one');

    const failed = await client.waitFor((m) => m.type === 'failed');
    expect(failed.job.state).toBe('failed');
    expect(failed.job.failureReason).toContain('Fake build failed');
    client.close();
  });

  it('turns a socket away without the pairing token', async () => {
    await startServer();
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: ORIGIN });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const seen: any[] = [];
    socket.on('message', (data) => seen.push(JSON.parse(data.toString())));
    socket.send(JSON.stringify({ type: 'hello', version: BUILD_PROTOCOL_VERSION, token: 'wrong' }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(seen[0]).toMatchObject({ type: 'error', code: 'UNAUTHORIZED' });
    socket.close();
  });

  it('turns a socket away from an origin it was not paired with', async () => {
    await startServer();
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://example.test' });
    await expect(new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    })).rejects.toBeTruthy();
  });

  /**
   * The archive never travels over the socket — it would need the whole release
   * in memory twice, and the message cap exists so that cannot happen by
   * accident. A binary frame here is either a bug or an attempt to route around
   * the upload endpoint's size and hash checks.
   */
  it('rejects binary frames on the socket', async () => {
    await startServer();
    const client = await TestClient.connect(port, server.token);
    (client as any).socket.send(new Uint8Array([1, 2, 3]));
    const error = await client.waitFor((m) => m.type === 'error');
    expect(error.code).toBe('MALFORMED');
    client.close();
  });

  it('rejects an unsafe command id without taking down the socket', async () => {
    await startServer();
    const client = await TestClient.connect(port, server.token);
    client.send({ type: 'status', requestId: '../escape' });
    const error = await client.waitFor((m) => m.type === 'error');
    expect(error.code).toBe('MALFORMED');

    client.send({ type: 'status', requestId: 'req_one' });
    const second = await client.waitFor((m) => m.type === 'error' && m.code === 'UNKNOWN_REQUEST');
    expect(second.code).toBe('UNKNOWN_REQUEST');
    client.close();
  });

  it('reports an artifact whose time is up as expired, and removes it', async () => {
    let clock = Date.parse('2026-08-30T10:00:00.000Z');
    await startServer({ artifactTtlMs: 1000, now: () => clock });
    const client = await TestClient.connect(port, server.token);
    client.send({ type: 'submit', request: request() });
    await client.waitFor((m) => m.type === 'progress');
    await upload(port, server.token, 'req_one');
    await client.waitFor((m) => m.type === 'completed');

    clock += 5000;
    client.send({ type: 'status', requestId: 'req_one' });
    const expired = await client.waitFor((m) => m.job?.state === 'expired');

    expect(expired.job.state).toBe('expired');
    expect(existsSync(path.join(workDir, 'artifacts', 'req_one'))).toBe(false);
    client.close();
  });
});

describe('abandoned uploads', () => {
  /**
   * A closed laptop mid-upload is the normal case. Without a sweep the helper's
   * directory grows by one release per abandoned attempt until someone notices
   * the disk is full.
   */
  it('sweeps a .part nobody came back for, and leaves a fresh one alone', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vne-uploads-'));
    try {
      const stale = path.join(dir, 'old.vnerelease.part');
      const fresh = path.join(dir, 'new.vnerelease.part');
      const finished = path.join(dir, 'done.vnerelease');
      for (const file of [stale, fresh, finished]) writeFileSync(file, 'x');

      const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
      utimesSync(stale, old, old);

      const swept = sweepAbandonedUploads(dir, 60 * 60 * 1000);

      expect(swept).toEqual(['old.vnerelease.part']);
      expect(existsSync(stale)).toBe(false);
      expect(existsSync(fresh)).toBe(true);
      // A finished upload is not a leftover.
      expect(existsSync(finished)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
