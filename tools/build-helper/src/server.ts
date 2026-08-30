/**
 * The build helper: a local service the browser pairs with and follows.
 *
 * It owns everything the app must not — a toolchain, a signing credential, a
 * cloud account — and exposes exactly two ways in: an HTTP endpoint that takes
 * one release archive, and a socket carrying its own small message set
 * (`lib/release/build-protocol.ts`). The pairing model is the AI bridge's — a
 * loopback origin and a token checked in constant time — and the protocol
 * deliberately is not.
 *
 * The state lives on disk (`job-store.ts`), so a browser reload rejoins a
 * running build instead of paying for a second one. That is the whole reason
 * this is a service rather than a client adapter, and every rule below follows
 * from it: an idempotency key that can never address two payloads, cancel and
 * retry as explicit operations, and an artifact with a stated expiry rather than
 * a link that quietly stops working.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';

import {
  applyBuildEvent,
  createBuildJob,
  isBuildArtifactExpired,
  summarizeBuildJob,
  withBuildArtifact,
  withBuildLog,
  type BuildJob,
} from '../../../lib/release/build-job';
import {
  encodeBuildServerMessage,
  parseBuildClientMessage,
  BUILD_PROTOCOL_VERSION,
  MAX_BUILD_MESSAGE_BYTES,
  type BuildErrorCode,
  type BuildServerMessage,
} from '../../../lib/release/build-protocol';
import {
  BUILD_LIMITS,
  isSameBuildRequest,
  type BuildRequest,
} from '../../../lib/release/build-request';
import { normalizeAllowedOrigins } from '../../ai-bridge/src/origin-policy';
import { BuildJobStore } from './job-store';
import { FakeBuilder, type Builder } from './builder';
import { sanitizeBuildLog } from './log-sanitizer';
import { buildArchivePath, receiveBuildInput, sweepAbandonedUploads } from './upload';

const UPLOAD_ROUTE = /^\/build-inputs\/([A-Za-z0-9_-]{1,64})$/;

export interface BuildHelperOptions {
  port?: number;
  token?: string;
  allowedOrigins?: string[];
  /** Where jobs, uploads and artifacts live. */
  workDirectory: string;
  builder?: Builder;
  logger?: (line: string) => void;
  maxUploadBytes?: number;
  artifactTtlMs?: number;
  now?: () => number;
}

export class BuildHelperServer {
  readonly token: string;
  private readonly allowedOrigins: Set<string>;
  private readonly store: BuildJobStore;
  private readonly builder: Builder;
  private readonly log: (line: string) => void;
  private readonly running = new Map<string, AbortController>();
  private readonly sockets = new Set<WebSocket>();
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;

  constructor(private readonly options: BuildHelperOptions) {
    this.token = options.token ?? randomBytes(24).toString('hex');
    this.allowedOrigins = new Set(normalizeAllowedOrigins(options.allowedOrigins));
    this.store = new BuildJobStore({ directory: path.join(options.workDirectory, 'jobs') });
    this.builder = options.builder ?? new FakeBuilder();
    this.log = options.logger ?? (() => {});
    mkdirSync(this.uploadsDir, { recursive: true });
    mkdirSync(this.artifactsDir, { recursive: true });
  }

  private get uploadsDir(): string {
    return path.join(this.options.workDirectory, 'uploads');
  }

  private get artifactsDir(): string {
    return path.join(this.options.workDirectory, 'artifacts');
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private stamp(): string {
    return new Date(this.now()).toISOString();
  }

  async start(): Promise<number> {
    // Anything left behind by a previous run, before accepting new work.
    sweepAbandonedUploads(this.uploadsDir, BUILD_LIMITS.abandonedUploadMs, this.now());

    this.http = createServer((request, response) => {
      void this.handleHttp(request, response);
    });
    this.wss = new WebSocketServer({
      server: this.http,
      maxPayload: MAX_BUILD_MESSAGE_BYTES,
      verifyClient: ({ origin }: { origin: string }) => this.allowedOrigins.has(origin),
    });
    this.wss.on('connection', (socket) => this.handleSocket(socket));

    await new Promise<void>((resolve, reject) => {
      this.http?.once('error', reject);
      this.http?.listen(this.options.port ?? 0, '127.0.0.1', resolve);
    });
    const address = this.http?.address();
    return typeof address === 'object' && address ? address.port : (this.options.port ?? 0);
  }

  async close(): Promise<void> {
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
    for (const socket of this.sockets) socket.close(1001, 'Shutting down');
    this.sockets.clear();
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      if (!this.http) return resolve();
      this.http.close(() => resolve());
    });
    this.wss = null;
    this.http = null;
  }

  // ── HTTP: one endpoint, one job's archive ────────────────────────────────

  private tokenMatches(candidate: string | undefined): boolean {
    if (!candidate) return false;
    const encoder = new TextEncoder();
    const a = encoder.encode(candidate);
    const b = encoder.encode(this.token);
    // Equal length first: `timingSafeEqual` throws on a mismatch, and the length
    // is not the secret.
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async handleHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = request.url ?? '';
    if (url === '/health') return this.respond(response, 200, { ok: true });

    const match = UPLOAD_ROUTE.exec(url.split('?')[0]);
    if (!match || request.method !== 'POST') {
      return this.respond(response, 404, { code: 'NOT_FOUND', message: 'No such endpoint' });
    }

    const origin = request.headers.origin;
    if (origin && !this.allowedOrigins.has(origin)) {
      return this.respond(response, 403, { code: 'FORBIDDEN', message: 'Origin not allowed' });
    }
    const header = request.headers['x-vne-build-token'];
    if (!this.tokenMatches(Array.isArray(header) ? header[0] : header)) {
      return this.respond(response, 401, { code: 'UNAUTHORIZED', message: 'Invalid helper token' });
    }

    const requestId = match[1];
    const job = this.store.read(requestId);
    if (!job) {
      // Submit first. Without a job the helper does not know which hash the
      // bytes are supposed to have, and accepting them would mean trusting the
      // uploader to say so afterwards.
      return this.respond(response, 404, {
        code: 'UNKNOWN_REQUEST',
        message: 'Submit the build request before uploading its release',
      });
    }

    const outcome = await receiveBuildInput(request, {
      directory: this.uploadsDir,
      requestId,
      expectedHash: job.request.payloadHash,
      maxBytes: this.options.maxUploadBytes,
    });

    if (!outcome.ok) {
      return this.respond(response, outcome.status, {
        code: outcome.code,
        message: outcome.message,
      });
    }

    this.store.write({ ...job, uploadedBytes: outcome.bytes, updatedAt: this.stamp() });
    this.respond(response, 200, { ok: true, bytes: outcome.bytes, sha256: outcome.sha256 });
    void this.runBuild(requestId);
  }

  private respond(response: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    response.writeHead(status, {
      'content-type': 'application/json',
      'content-length': new TextEncoder().encode(payload).byteLength,
    });
    response.end(payload);
  }

  // ── WebSocket: submit, follow, cancel, retry ─────────────────────────────

  private handleSocket(socket: WebSocket): void {
    let authenticated = false;
    this.sockets.add(socket);

    socket.on('close', () => this.sockets.delete(socket));
    socket.on('message', (data, isBinary) => {
      // The archive never comes this way; a binary frame here is either a bug or
      // an attempt to route around the upload endpoint's size and hash checks.
      if (isBinary) return this.fail(socket, 'MALFORMED', 'Binary frames are not accepted');

      let message;
      try {
        message = parseBuildClientMessage(data.toString());
      } catch (error) {
        return this.fail(socket, 'MALFORMED', error instanceof Error ? error.message : 'Bad message');
      }

      if (!authenticated) {
        if (message.type !== 'hello') {
          return this.closeWith(socket, 'UNAUTHORIZED', 'Say hello first');
        }
        if (!this.tokenMatches(message.token)) {
          return this.closeWith(socket, 'UNAUTHORIZED', 'Invalid helper token');
        }
        if (message.version !== BUILD_PROTOCOL_VERSION) {
          return this.closeWith(
            socket,
            'UNSUPPORTED_VERSION',
            `This helper speaks build protocol ${BUILD_PROTOCOL_VERSION}`,
          );
        }
        authenticated = true;
        return this.send(socket, { type: 'ready', version: BUILD_PROTOCOL_VERSION });
      }

      switch (message.type) {
        case 'hello':
          return this.fail(socket, 'MALFORMED', 'Already paired');
        case 'submit':
          return this.onSubmit(socket, message.request);
        case 'status':
          return this.onStatus(socket, message.requestId);
        case 'cancel':
          return this.onCancel(socket, message.requestId);
        case 'retry':
          return this.onRetry(socket, message.requestId);
      }
    });
  }

  /**
   * Submitting the same request twice rejoins the first job.
   *
   * That is what the idempotency key is for: a double click, a reconnect and a
   * retried socket must not each start a paid build. Submitting the same key
   * with a *different* payload is refused outright — it is not a race to
   * resolve, and answering it with the first job's artifact would attribute a
   * build to a release it was never made from.
   */
  private onSubmit(socket: WebSocket, request: BuildRequest): void {
    const existing = this.store.read(request.requestId);
    if (existing) {
      if (!isSameBuildRequest(existing.request, request)) {
        return this.fail(
          socket,
          'PAYLOAD_MISMATCH',
          'That request id already refers to a different release',
          request.requestId,
        );
      }
      return this.announce(existing);
    }

    const job = createBuildJob(request, this.stamp());
    this.store.write(job);
    // The operator's view. Deliberately the request id and target only: the
    // helper's own console is not a place to repeat what the sanitizer removes.
    this.log(`queued ${request.requestId} (${request.target})`);
    this.announce(job);
  }

  private onStatus(socket: WebSocket, requestId: string): void {
    const job = this.store.read(requestId);
    if (!job) return this.fail(socket, 'UNKNOWN_REQUEST', 'No such build', requestId);
    this.announce(this.expireIfDue(job));
  }

  private onCancel(socket: WebSocket, requestId: string): void {
    const job = this.store.read(requestId);
    if (!job) return this.fail(socket, 'UNKNOWN_REQUEST', 'No such build', requestId);

    this.running.get(requestId)?.abort();
    this.running.delete(requestId);
    const cancelled = applyBuildEvent(job, { type: 'cancel' }, this.stamp());
    this.store.write(cancelled);
    this.announce(cancelled);
  }

  private onRetry(socket: WebSocket, requestId: string): void {
    const job = this.store.read(requestId);
    if (!job) return this.fail(socket, 'UNKNOWN_REQUEST', 'No such build', requestId);

    const retried = applyBuildEvent(job, { type: 'retry' }, this.stamp());
    if (retried === job) {
      return this.fail(socket, 'NOT_RETRYABLE', `A build in "${job.state}" cannot be retried`, requestId);
    }
    this.store.write(retried);
    this.announce(retried);

    // The archive is still on disk from the first attempt, so a retry does not
    // ask the author to upload a release they already sent.
    if (existsSync(buildArchivePath(this.uploadsDir, requestId))) void this.runBuild(requestId);
  }

  // ── Running one build ────────────────────────────────────────────────────

  private async runBuild(requestId: string): Promise<void> {
    let job = this.store.read(requestId);
    if (!job) return;

    const archivePath = buildArchivePath(this.uploadsDir, requestId);
    if (!existsSync(archivePath)) {
      return this.finishWith(job, 'The uploaded release is missing');
    }

    const readiness = await this.builder.readiness();
    if (!readiness.ready) return this.finishWith(job, readiness.reason);

    job = this.record(applyBuildEvent(job, { type: 'stage' }, this.stamp()));

    // Re-check the archive against the hash the request declared. It was checked
    // as it arrived; this catches anything that touched it in between.
    const staged = await this.hashFile(archivePath);
    if (staged !== job.request.payloadHash) {
      return this.finishWith(job, 'The staged release no longer matches its declared hash');
    }

    job = this.record(applyBuildEvent(job, { type: 'submit' }, this.stamp()));

    const controller = new AbortController();
    this.running.set(requestId, controller);

    try {
      const result = await this.builder.build({
        request: job.request,
        archivePath,
        outputDirectory: path.join(this.artifactsDir, requestId),
        signal: controller.signal,
        onLog: (line) => {
          const current = this.store.read(requestId);
          if (!current) return;
          const lines = sanitizeBuildLog([line], { secrets: [this.token] });
          const withLog = withBuildLog(
            applyBuildEvent(current, { type: 'progress' }, this.stamp()),
            lines,
            this.stamp(),
          );
          this.store.write(withLog);
          this.announce(withLog, lines);
        },
      });

      if (controller.signal.aborted) return;

      job = this.record(applyBuildEvent(this.store.read(requestId) ?? job, { type: 'verify' }, this.stamp()));

      // What came back is checked before it is offered. A builder that produced
      // nothing, or something empty, must fail differently from one that never
      // ran — otherwise an author downloads a zero-byte APK and finds out later.
      if (!existsSync(result.artifactPath) || statSync(result.artifactPath).size === 0) {
        return this.finishWith(job, 'The build produced no artifact');
      }
      const artifact = {
        fileName: result.fileName,
        bytes: statSync(result.artifactPath).size,
        sha256: await this.hashFile(result.artifactPath),
        expiresAt: new Date(
          this.now() + (this.options.artifactTtlMs ?? BUILD_LIMITS.artifactTtlMs),
        ).toISOString(),
      };

      job = withBuildArtifact(job, artifact, this.stamp());
      job = this.record(applyBuildEvent(job, { type: 'succeed' }, this.stamp()));
      this.log(`succeeded ${requestId} → ${artifact.fileName} (${artifact.bytes} bytes)`);
    } catch (error) {
      const current = this.store.read(requestId) ?? job;
      if (controller.signal.aborted) {
        // Already announced by `onCancel`; a cancelled build is not a failure.
        return;
      }
      const [reason] = sanitizeBuildLog(
        [error instanceof Error ? error.message : String(error)],
        { secrets: [this.token] },
      );
      this.finishWith(current, reason);
    } finally {
      this.running.delete(requestId);
    }
  }

  private finishWith(job: BuildJob, reason: string): void {
    this.log(`failed ${job.request.requestId}: ${reason}`);
    this.record(applyBuildEvent(job, { type: 'fail', reason }, this.stamp()));
  }

  private record(job: BuildJob): BuildJob {
    this.store.write(job);
    this.announce(job);
    return job;
  }

  private expireIfDue(job: BuildJob): BuildJob {
    if (!isBuildArtifactExpired(job, this.now())) return job;
    const expired = applyBuildEvent(job, { type: 'expire' }, this.stamp());
    this.store.write(expired);
    // The bytes go with the state: an expired artifact that is still on disk is
    // a link that works for whoever knows the path.
    rmSync(path.join(this.artifactsDir, job.request.requestId), { recursive: true, force: true });
    return expired;
  }

  private async hashFile(file: string): Promise<string> {
    const hash = createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      createReadStream(file)
        // Cast, not converted: the chunk really is a Uint8Array at runtime.
        // The project's ambient `Buffer` is a React Native shim whose type does
        // not line up with Node's, and copying every chunk to satisfy it would
        // be real work done for a type error.
        .on('data', (chunk) => hash.update(chunk as unknown as Uint8Array))
        .on('end', resolve)
        .on('error', reject);
    });
    return hash.digest('hex');
  }

  // ── Talking to clients ───────────────────────────────────────────────────

  private announce(job: BuildJob, log?: string[]): void {
    const summary = summarizeBuildJob(job);
    const message: BuildServerMessage = job.state === 'succeeded'
      ? { type: 'completed', job: summary }
      : job.state === 'failed' || job.state === 'cancelled' || job.state === 'expired'
        ? { type: 'failed', job: summary }
        : { type: 'progress', job: summary, ...(log ? { log } : {}) };
    for (const socket of this.sockets) this.send(socket, message);
  }

  private send(socket: WebSocket, message: BuildServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(encodeBuildServerMessage(message));
  }

  private fail(socket: WebSocket, code: BuildErrorCode, message: string, requestId?: string): void {
    this.send(socket, { type: 'error', code, message, ...(requestId ? { requestId } : {}) });
  }

  private closeWith(socket: WebSocket, code: BuildErrorCode, message: string): void {
    this.fail(socket, code, message);
    socket.close(1008, code);
  }
}
