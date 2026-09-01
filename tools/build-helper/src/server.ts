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
import {
  createReadStream,
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
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
import { EasBuilder, type Builder } from './builder';
import { sanitizeBuildLog } from './log-sanitizer';
import { buildArchivePath, receiveBuildInput, sweepAbandonedUploads } from './upload';

const UPLOAD_ROUTE = /^\/build-inputs\/([A-Za-z0-9_-]{1,64})$/;
const ARTIFACT_ROUTE = /^\/build-artifacts\/([A-Za-z0-9_-]{1,64})$/;
const HANDSHAKE_TIMEOUT_MS = 5_000;

interface ActiveRun {
  controller: AbortController;
  attempt: number;
  done: Promise<void>;
}

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
  private readonly running = new Map<string, ActiveRun>();
  private readonly uploading = new Set<string>();
  private readonly sockets = new Set<WebSocket>();
  private readonly subscriptions = new Map<WebSocket, Set<string>>();
  private builderReadiness: Awaited<ReturnType<Builder['readiness']>> | null = null;
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;

  constructor(private readonly options: BuildHelperOptions) {
    this.token = options.token ?? randomBytes(24).toString('hex');
    this.allowedOrigins = new Set(normalizeAllowedOrigins(options.allowedOrigins));
    this.store = new BuildJobStore({ directory: path.join(options.workDirectory, 'jobs') });
    this.builder = options.builder ?? new EasBuilder();
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

  get builderStatus(): Awaited<ReturnType<Builder['readiness']>> | null {
    return this.builderReadiness;
  }

  async start(): Promise<number> {
    // Anything left behind by a previous run, before accepting new work.
    sweepAbandonedUploads(this.uploadsDir, BUILD_LIMITS.abandonedUploadMs, this.now());

    const resumable = await this.reconcilePersistedJobs();
    this.builderReadiness = await this.builder.readiness();
    this.http = createServer((request, response) => {
      void this.handleHttp(request, response).catch((error) => {
        const [reason] = sanitizeBuildLog(
          [error instanceof Error ? error.message : String(error)],
          { secrets: [this.token] },
        );
        this.log(`HTTP request failed: ${reason}`);
        if (!response.headersSent) this.respond(response, 500, { code: 'INTERNAL', message: 'Build helper failed' });
        else response.destroy();
      });
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
    if (this.builderReadiness.ready) {
      for (const requestId of resumable) void this.runBuild(requestId);
    }
    return typeof address === 'object' && address ? address.port : (this.options.port ?? 0);
  }

  async close(): Promise<void> {
    const active = [...this.running.entries()];
    for (const [requestId, run] of active) {
      run.controller.abort();
      const job = this.store.read(requestId);
      if (job && job.attempt === run.attempt) {
        const stopped = applyBuildEvent(
          job,
          { type: 'fail', reason: 'The build helper stopped; retry this build.' },
          this.stamp(),
        );
        this.store.write(stopped);
      }
    }
    await Promise.allSettled(active.map(([, run]) => run.done));
    this.running.clear();
    for (const socket of this.sockets) socket.close(1001, 'Shutting down');
    this.sockets.clear();
    this.subscriptions.clear();
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
    const url = (request.url ?? '').split('?')[0];
    if (url === '/health') return this.respond(response, 200, { ok: true });

    const uploadMatch = UPLOAD_ROUTE.exec(url);
    const artifactMatch = ARTIFACT_ROUTE.exec(url);
    if (!uploadMatch && !artifactMatch) {
      return this.respond(response, 404, { code: 'NOT_FOUND', message: 'No such endpoint' });
    }

    const origin = request.headers.origin;
    if (!origin || !this.allowedOrigins.has(origin)) {
      return this.respond(response, 403, { code: 'FORBIDDEN', message: 'Origin not allowed' });
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, this.corsHeaders(origin));
      response.end();
      return;
    }
    const header = request.headers['x-vne-build-token'];
    if (!this.tokenMatches(Array.isArray(header) ? header[0] : header)) {
      return this.respond(
        response,
        401,
        { code: 'UNAUTHORIZED', message: 'Invalid helper token' },
        origin,
      );
    }

    if (uploadMatch && request.method === 'POST') {
      return this.handleUpload(request, response, uploadMatch[1], origin);
    }
    if (artifactMatch && request.method === 'GET') {
      return this.handleArtifactDownload(response, artifactMatch[1], origin);
    }
    return this.respond(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }, origin);
  }

  private async handleUpload(
    request: IncomingMessage,
    response: ServerResponse,
    requestId: string,
    origin: string,
  ): Promise<void> {
    const job = this.store.read(requestId);
    if (!job) {
      // Submit first. Without a job the helper does not know which hash the
      // bytes are supposed to have, and accepting them would mean trusting the
      // uploader to say so afterwards.
      return this.respond(response, 404, {
        code: 'UNKNOWN_REQUEST',
        message: 'Submit the build request before uploading its release',
      }, origin);
    }
    if (job.state !== 'queued' || job.uploadedBytes !== undefined || this.uploading.has(requestId)) {
      return this.respond(response, 409, {
        code: 'NOT_UPLOADABLE',
        message: 'This build is not waiting for an upload',
      }, origin);
    }

    this.uploading.add(requestId);
    const attempt = job.attempt;
    try {
      // A crash can happen after the verified .part file is renamed but before
      // uploadedBytes reaches the durable job record. Reuse that already
      // verified archive instead of making retries fail on an existing target.
      if (await this.reconcileQueuedArchive(job)) {
        const recovered = this.store.read(requestId);
        this.respond(response, 200, {
          ok: true,
          bytes: recovered?.uploadedBytes ?? statSync(buildArchivePath(this.uploadsDir, requestId)).size,
          sha256: job.request.payloadHash,
        }, origin);
        void this.runBuild(requestId);
        return;
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
        }, origin);
      }

      // Cancel/retry may have landed while the bytes were still arriving. The
      // snapshot from before the await cannot be allowed to resurrect it.
      const current = this.store.read(requestId);
      if (!current || current.state !== 'queued' || current.attempt !== attempt) {
        rmSync(outcome.archivePath, { force: true });
        return this.respond(response, 409, {
          code: 'STATE_CHANGED',
          message: 'The build changed state while its release was uploading',
        }, origin);
      }

      this.store.write({ ...current, uploadedBytes: outcome.bytes, updatedAt: this.stamp() });
      this.respond(
        response,
        200,
        { ok: true, bytes: outcome.bytes, sha256: outcome.sha256 },
        origin,
      );
      void this.runBuild(requestId);
    } finally {
      this.uploading.delete(requestId);
    }
  }

  private async handleArtifactDownload(
    response: ServerResponse,
    requestId: string,
    origin: string,
  ): Promise<void> {
    const raw = this.store.read(requestId);
    if (!raw) {
      return this.respond(response, 404, { code: 'UNKNOWN_REQUEST', message: 'No such build' }, origin);
    }
    const job = this.expireIfDue(raw);
    if (job.state !== 'succeeded' || !job.artifact) {
      return this.respond(response, 409, {
        code: 'ARTIFACT_UNAVAILABLE',
        message: 'This build has no downloadable artifact',
      }, origin);
    }

    const artifactPath = this.artifactPathFor(job);
    if (!existsSync(artifactPath) || await this.hashFile(artifactPath) !== job.artifact.sha256) {
      this.expireArtifact(job);
      return this.respond(response, 409, {
        code: 'ARTIFACT_INVALID',
        message: 'The build artifact is missing or failed its integrity check',
      }, origin);
    }

    response.writeHead(200, {
      ...this.corsHeaders(origin),
      'content-type': job.request.target === 'apk'
        ? 'application/vnd.android.package-archive'
        : 'application/octet-stream',
      'content-length': job.artifact.bytes,
      'content-disposition': `attachment; filename="${job.artifact.fileName}"`,
      'x-content-type-options': 'nosniff',
    });
    await new Promise<void>((resolve, reject) => {
      createReadStream(artifactPath)
        .on('error', reject)
        .on('end', resolve)
        .pipe(response);
    });
  }

  private corsHeaders(origin: string): Record<string, string> {
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'x-vne-build-token, content-type',
      'access-control-max-age': '600',
      vary: 'Origin',
    };
  }

  private respond(response: ServerResponse, status: number, body: unknown, origin?: string): void {
    const payload = JSON.stringify(body);
    response.writeHead(status, {
      ...(origin ? this.corsHeaders(origin) : {}),
      'content-type': 'application/json',
      'content-length': new TextEncoder().encode(payload).byteLength,
      'x-content-type-options': 'nosniff',
    });
    response.end(payload);
  }

  // ── WebSocket: submit, follow, cancel, retry ─────────────────────────────

  private handleSocket(socket: WebSocket): void {
    let authenticated = false;
    const handshakeTimer = setTimeout(() => {
      if (!authenticated) this.closeWith(socket, 'UNAUTHORIZED', 'Pairing timed out');
    }, HANDSHAKE_TIMEOUT_MS);

    socket.on('close', () => {
      clearTimeout(handshakeTimer);
      this.sockets.delete(socket);
      this.subscriptions.delete(socket);
    });
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
        clearTimeout(handshakeTimer);
        this.sockets.add(socket);
        this.subscriptions.set(socket, new Set());
        return this.send(socket, { type: 'ready', version: BUILD_PROTOCOL_VERSION });
      }

      try {
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
      } catch (error) {
        const [reason] = sanitizeBuildLog(
          [error instanceof Error ? error.message : String(error)],
          { secrets: [this.token] },
        );
        return this.fail(socket, 'INTERNAL', reason);
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
    this.subscribe(socket, request.requestId);
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

    if (!this.builderReadiness?.ready) {
      return this.fail(
        socket,
        'BUILDER_UNAVAILABLE',
        this.builderReadiness?.reason ?? 'The builder readiness check has not completed',
        request.requestId,
      );
    }

    const job = createBuildJob(request, this.stamp());
    this.store.write(job);
    // The operator's view. Deliberately the request id and target only: the
    // helper's own console is not a place to repeat what the sanitizer removes.
    this.log(`queued ${request.requestId} (${request.target})`);
    this.announce(job);
  }

  private onStatus(socket: WebSocket, requestId: string): void {
    this.subscribe(socket, requestId);
    const job = this.store.read(requestId);
    if (!job) return this.fail(socket, 'UNKNOWN_REQUEST', 'No such build', requestId);
    const current = this.expireIfDue(job);
    this.sendJob(socket, current, current.log);
  }

  private onCancel(socket: WebSocket, requestId: string): void {
    this.subscribe(socket, requestId);
    const job = this.store.read(requestId);
    if (!job) return this.fail(socket, 'UNKNOWN_REQUEST', 'No such build', requestId);

    this.running.get(requestId)?.controller.abort();
    const cancelled = applyBuildEvent(job, { type: 'cancel' }, this.stamp());
    this.store.write(cancelled);
    this.announce(cancelled);
  }

  private onRetry(socket: WebSocket, requestId: string): void {
    this.subscribe(socket, requestId);
    const job = this.store.read(requestId);
    if (!job) return this.fail(socket, 'UNKNOWN_REQUEST', 'No such build', requestId);
    if (!this.builderReadiness?.ready) {
      return this.fail(
        socket,
        'BUILDER_UNAVAILABLE',
        this.builderReadiness?.reason ?? 'The builder readiness check has not completed',
        requestId,
      );
    }
    if (this.running.has(requestId) || this.uploading.has(requestId)) {
      return this.fail(
        socket,
        'NOT_RETRYABLE',
        'The previous attempt is still stopping',
        requestId,
      );
    }

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
    const initial = this.store.read(requestId);
    if (!initial || initial.state !== 'queued' || initial.uploadedBytes === undefined) return;
    const existing = this.running.get(requestId);
    if (existing) return existing.done;

    const run: ActiveRun = {
      controller: new AbortController(),
      attempt: initial.attempt,
      done: Promise.resolve(),
    };
    this.running.set(requestId, run);
    run.done = this.executeBuild(requestId, run).finally(() => {
      if (this.running.get(requestId) === run) this.running.delete(requestId);
    });
    return run.done;
  }

  private async executeBuild(requestId: string, run: ActiveRun): Promise<void> {
    let job = this.store.read(requestId);
    if (!job || job.state !== 'queued' || job.attempt !== run.attempt) return;
    const archivePath = buildArchivePath(this.uploadsDir, requestId);

    try {
      if (!existsSync(archivePath)) return this.finishWith(job, 'The uploaded release is missing');

      const readiness = await this.builder.readiness();
      if (run.controller.signal.aborted) return;
      if (!readiness.ready) return this.finishWith(job, readiness.reason);

      job = this.store.read(requestId);
      if (!job || job.state !== 'queued' || job.attempt !== run.attempt) return;
      const staging = applyBuildEvent(job, { type: 'stage' }, this.stamp());
      if (staging === job) return;
      job = this.record(staging);

      // Re-check the archive against the hash the request declared. It was checked
      // as it arrived; this catches anything that touched it in between.
      const staged = await this.hashFile(archivePath);
      if (run.controller.signal.aborted) return;
      if (staged !== job.request.payloadHash) {
        return this.finishWith(job, 'The staged release no longer matches its declared hash');
      }

      const current = this.store.read(requestId);
      if (!current || current.state !== 'staging' || current.attempt !== run.attempt) return;
      job = this.record(applyBuildEvent(current, { type: 'submit' }, this.stamp()));

      const outputDirectory = path.join(this.artifactsDir, requestId);
      rmSync(outputDirectory, { recursive: true, force: true });
      mkdirSync(outputDirectory, { recursive: true });
      const result = await this.builder.build({
        request: job.request,
        archivePath,
        outputDirectory,
        signal: run.controller.signal,
        onLog: (line) => {
          if (run.controller.signal.aborted || this.running.get(requestId) !== run) return;
          const live = this.store.read(requestId);
          if (!live || live.attempt !== run.attempt || !['submitted', 'building'].includes(live.state)) return;
          const lines = sanitizeBuildLog([line], { secrets: [this.token] });
          const withLog = withBuildLog(
            applyBuildEvent(live, { type: 'progress' }, this.stamp()),
            lines,
            this.stamp(),
          );
          this.store.write(withLog);
          this.announce(withLog, lines);
        },
      });

      if (run.controller.signal.aborted || this.running.get(requestId) !== run) return;
      const afterBuild = this.store.read(requestId);
      if (!afterBuild || afterBuild.attempt !== run.attempt || !['submitted', 'building'].includes(afterBuild.state)) return;
      job = this.record(applyBuildEvent(afterBuild, { type: 'verify' }, this.stamp()));

      // Trust neither path nor name supplied by a builder. It may only return a
      // non-empty file from the directory assigned to this request.
      if (!existsSync(result.artifactPath) || statSync(result.artifactPath).size === 0) {
        return this.finishWith(job, 'The build produced no artifact');
      }
      const outputRoot = realpathSync(outputDirectory);
      const builtPath = realpathSync(result.artifactPath);
      const relative = path.relative(outputRoot, builtPath);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return this.finishWith(job, 'The builder returned an artifact outside its output directory');
      }

      const fileName = `${job.request.releaseId}-${job.request.versionCode}.${job.request.target}`;
      const artifactPath = path.join(outputRoot, fileName);
      if (builtPath !== artifactPath) renameSync(builtPath, artifactPath);
      const artifact = {
        fileName,
        bytes: statSync(artifactPath).size,
        sha256: await this.hashFile(artifactPath),
        expiresAt: new Date(
          this.now() + (this.options.artifactTtlMs ?? BUILD_LIMITS.artifactTtlMs),
        ).toISOString(),
      };

      const beforeSuccess = this.store.read(requestId);
      if (!beforeSuccess || beforeSuccess.state !== 'verifying' || beforeSuccess.attempt !== run.attempt) return;
      job = withBuildArtifact(beforeSuccess, artifact, this.stamp());
      job = this.record(applyBuildEvent(job, { type: 'succeed' }, this.stamp()));
      this.log(`succeeded ${requestId} → ${artifact.fileName} (${artifact.bytes} bytes)`);
    } catch (error) {
      const current = this.store.read(requestId) ?? job;
      if (!current || run.controller.signal.aborted) return;
      const [reason] = sanitizeBuildLog(
        [error instanceof Error ? error.message : String(error)],
        { secrets: [this.token] },
      );
      this.finishWith(current, reason);
    }
  }

  private finishWith(job: BuildJob, reason: string): void {
    const [safeReason] = sanitizeBuildLog([reason], { secrets: [this.token] });
    this.log(`failed ${job.request.requestId}: ${safeReason}`);
    this.record(applyBuildEvent(job, { type: 'fail', reason: safeReason }, this.stamp()));
  }

  private record(job: BuildJob): BuildJob {
    this.store.write(job);
    this.announce(job);
    return job;
  }

  private expireIfDue(job: BuildJob): BuildJob {
    if (!isBuildArtifactExpired(job, this.now())) return job;
    return this.expireArtifact(job);
  }

  private expireArtifact(job: BuildJob): BuildJob {
    const expired = applyBuildEvent(job, { type: 'expire' }, this.stamp());
    this.store.write(expired);
    // The bytes go with the state: an expired artifact that is still on disk is
    // a link that works for whoever knows the path.
    rmSync(path.join(this.artifactsDir, job.request.requestId), { recursive: true, force: true });
    return expired;
  }

  private artifactPathFor(job: BuildJob): string {
    if (!job.artifact || path.basename(job.artifact.fileName) !== job.artifact.fileName) {
      throw new Error('Unsafe artifact name in build record');
    }
    return path.join(this.artifactsDir, job.request.requestId, job.artifact.fileName);
  }

  /** Reconcile durable records before accepting traffic after a restart. */
  private async reconcilePersistedJobs(): Promise<string[]> {
    const resumable: string[] = [];
    for (const raw of this.store.list()) {
      const job = this.expireIfDue(raw);
      if (job.state === 'queued') {
        if (await this.reconcileQueuedArchive(job)) resumable.push(job.request.requestId);
        continue;
      }
      if (['staging', 'submitted', 'building', 'verifying'].includes(job.state)) {
        const failed = applyBuildEvent(
          job,
          { type: 'fail', reason: 'The build helper restarted; retry this build.' },
          this.stamp(),
        );
        this.store.write(failed);
      }
    }
    return resumable;
  }

  /** Repair the only non-atomic boundary shared by the upload and job files. */
  private async reconcileQueuedArchive(job: BuildJob): Promise<boolean> {
    if (job.state !== 'queued') return false;
    const archive = buildArchivePath(this.uploadsDir, job.request.requestId);
    if (!existsSync(archive)) {
      // The archive may have been removed manually after a completed upload.
      // Clear the marker so the request can accept the bytes again.
      if (job.uploadedBytes !== undefined) {
        this.store.write({ ...job, uploadedBytes: undefined, updatedAt: this.stamp() });
      }
      return false;
    }
    if (job.uploadedBytes !== undefined) return true;

    const sha256 = await this.hashFile(archive);
    if (sha256 !== job.request.payloadHash) {
      rmSync(archive, { force: true });
      return false;
    }

    const current = this.store.read(job.request.requestId);
    if (!current || current.state !== 'queued' || current.attempt !== job.attempt) return false;
    this.store.write({
      ...current,
      uploadedBytes: statSync(archive).size,
      updatedAt: this.stamp(),
    });
    return true;
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
    for (const socket of this.sockets) {
      if (!this.subscriptions.get(socket)?.has(job.request.requestId)) continue;
      this.sendJob(socket, job, log);
    }
  }

  private sendJob(socket: WebSocket, job: BuildJob, log?: string[]): void {
    const summary = summarizeBuildJob(job);
    const message: BuildServerMessage = job.state === 'succeeded'
      ? { type: 'completed', job: summary, ...(log?.length ? { log } : {}) }
      : job.state === 'failed' || job.state === 'cancelled' || job.state === 'expired'
        ? { type: 'failed', job: summary, ...(log?.length ? { log } : {}) }
        : { type: 'progress', job: summary, ...(log ? { log } : {}) };
    this.send(socket, message);
  }

  private subscribe(socket: WebSocket, requestId: string): void {
    this.subscriptions.get(socket)?.add(requestId);
  }

  private send(socket: WebSocket, message: BuildServerMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    // Drop intermediate progress for a stalled tab instead of buffering logs
    // without bound. A later status request reconstructs state and log history.
    if (message.type === 'progress' && socket.bufferedAmount > MAX_BUILD_MESSAGE_BYTES * 4) return;
    socket.send(encodeBuildServerMessage(message));
  }

  private fail(socket: WebSocket, code: BuildErrorCode, message: string, requestId?: string): void {
    this.send(socket, { type: 'error', code, message, ...(requestId ? { requestId } : {}) });
  }

  private closeWith(socket: WebSocket, code: BuildErrorCode, message: string): void {
    this.fail(socket, code, message);
    socket.close(1008, code);
  }
}
