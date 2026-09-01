/**
 * The app's half of the build contract.
 *
 * It submits a request, uploads one release and follows what happens. It holds
 * no credential, runs no toolchain and makes no decision about the build — those
 * belong to the helper, and keeping them there is the reason this file is as
 * small as it is.
 *
 * Reconnecting is ordinary, not exceptional. A tab that is reloaded mid-build
 * connects again, sends `status` for the request id it already knows, and
 * rejoins — which is why the id is chosen by the app and reused rather than
 * handed out by the helper.
 */
import {
  BUILD_PROTOCOL_VERSION,
  parseBuildServerMessage,
  type BuildServerMessage,
} from '@/lib/release/build-protocol';
import type { BuildRequest } from '@/lib/release/build-request';
import { readBlobBytes } from '@/lib/blob-bytes';
import type { BuildArtifact, BuildJobSummary } from '@/lib/release/build-job';

export interface BuildClientOptions {
  /** e.g. `http://127.0.0.1:8790`. The socket url is derived from it. */
  endpoint: string;
  token: string;
  onMessage: (message: BuildServerMessage) => void;
  onClose?: (reason: string) => void;
  /** Injectable for tests; defaults to the platform's. */
  createSocket?: (url: string) => WebSocket;
  fetch?: typeof fetch;
  /** Automatic reconnect is on by default. Disable it only for one-shot tools. */
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export function buildSocketUrl(endpoint: string): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/';
  return url.toString();
}

export class BuildClient {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private hasBeenReady = false;
  private manuallyClosed = true;
  private ready = false;
  private readonly queued: string[] = [];
  private readonly subscriptions = new Set<string>();
  private readonly pendingSubmits = new Map<string, BuildRequest>();
  private readonly submitAcks = new Map<string, Promise<BuildJobSummary>>();
  private readonly submitWaiters = new Map<string, {
    resolve: (job: BuildJobSummary) => void;
    reject: (error: Error) => void;
  }>();

  constructor(private readonly options: BuildClientOptions) {}

  async connect(): Promise<void> {
    this.manuallyClosed = false;
    if (this.ready) return;
    if (this.connectPromise) return this.connectPromise;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const connection = this.openSocket();
    this.connectPromise = connection;
    try {
      await connection;
    } finally {
      if (this.connectPromise === connection) this.connectPromise = null;
    }
  }

  private openSocket(): Promise<void> {
    const create = this.options.createSocket ?? ((url: string) => new WebSocket(url));
    const socket = create(buildSocketUrl(this.options.endpoint));
    this.socket = socket;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let permanentFailure = false;
      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const timeout = setTimeout(() => {
        rejectOnce(new Error('Build helper pairing timed out'));
        socket.close();
      }, 5_000);
      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'hello',
          version: BUILD_PROTOCOL_VERSION,
          token: this.options.token,
        }));
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        if (this.socket === socket) {
          this.socket = null;
          this.ready = false;
        }
        rejectOnce(new Error('Could not reach the build helper'));
        this.options.onClose?.('error');
        this.scheduleReconnect();
        socket.close();
      };
      socket.onmessage = (event: MessageEvent) => {
        if (this.socket !== socket) return;
        let message: BuildServerMessage;
        try {
          message = parseBuildServerMessage(String(event.data));
        } catch {
          return;
        }
        if (message.type === 'ready') {
          if (message.version !== BUILD_PROTOCOL_VERSION) {
            clearTimeout(timeout);
            permanentFailure = true;
            rejectOnce(new Error(`Unsupported build protocol ${message.version}`));
            socket.close();
            return;
          }
          clearTimeout(timeout);
          this.ready = true;
          this.reconnectAttempt = 0;
          for (const frame of this.queued.splice(0)) socket.send(frame);
          if (this.hasBeenReady) this.restoreSubscriptions(socket);
          this.hasBeenReady = true;
          resolveOnce();
          return;
        }
        if (!this.ready && message.type === 'error') {
          permanentFailure = ['UNAUTHORIZED', 'UNSUPPORTED_VERSION'].includes(message.code);
          if (permanentFailure) {
            clearTimeout(timeout);
            rejectOnce(new Error(message.message));
            socket.close();
          }
        }
        const requestId = 'job' in message
          ? message.job.requestId
          : message.type === 'error'
            ? message.requestId
            : undefined;
        if (requestId) {
          const waiter = this.submitWaiters.get(requestId);
          if (waiter && 'job' in message) {
            this.submitWaiters.delete(requestId);
            waiter.resolve(message.job);
          } else if (waiter && message.type === 'error') {
            this.submitWaiters.delete(requestId);
            waiter.reject(new Error(message.message));
          }
        }
        this.options.onMessage(message);
      };
      socket.onclose = (event: CloseEvent) => {
        if (this.socket !== socket) return;
        clearTimeout(timeout);
        this.socket = null;
        this.ready = false;
        const error = new Error(event.reason || 'Build helper connection closed');
        rejectOnce(error);
        this.options.onClose?.(event.reason || 'closed');
        if (!permanentFailure && !this.manuallyClosed && this.options.reconnect !== false) {
          this.scheduleReconnect();
        } else if (!this.manuallyClosed) {
          this.rejectPending(error);
        }
      };
    });
  }

  private restoreSubscriptions(socket: WebSocket): void {
    // A submit is idempotent and doubles as a status request. Re-send any one
    // whose acknowledgement was lost with the socket, then rejoin every other
    // job explicitly. This cannot start a second paid build on a conforming
    // helper because requestId + payloadHash identify the existing job.
    for (const request of this.pendingSubmits.values()) {
      socket.send(JSON.stringify({ type: 'submit', request }));
    }
    for (const requestId of this.subscriptions) {
      if (!this.pendingSubmits.has(requestId)) {
        socket.send(JSON.stringify({ type: 'status', requestId }));
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed || this.options.reconnect === false || this.reconnectTimer) return;
    const initial = Math.max(0, this.options.reconnectDelayMs ?? 250);
    const maximum = Math.max(initial, this.options.maxReconnectDelayMs ?? 5_000);
    const delay = Math.min(maximum, initial * (2 ** this.reconnectAttempt));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {
        // openSocket schedules the next bounded attempt. The original caller
        // already received its connection error, so there is nothing to throw.
      });
    }, delay);
  }

  private rejectPending(error: Error): void {
    for (const waiter of this.submitWaiters.values()) waiter.reject(error);
    this.submitWaiters.clear();
    this.pendingSubmits.clear();
  }

  private send(message: unknown): void {
    const frame = JSON.stringify(message);
    if (!this.socket) {
      if (this.hasBeenReady && !this.manuallyClosed && this.options.reconnect !== false) {
        this.queued.push(frame);
        return;
      }
      throw new Error('The build client is not connected');
    }
    if (!this.ready) {
      this.queued.push(frame);
      return;
    }
    this.socket.send(frame);
  }

  submit(request: BuildRequest): Promise<BuildJobSummary> {
    const existing = this.submitAcks.get(request.requestId);
    if (existing) return existing;
    this.subscriptions.add(request.requestId);
    const acknowledged = new Promise<BuildJobSummary>((resolve, reject) => {
      this.submitWaiters.set(request.requestId, { resolve, reject });
      this.pendingSubmits.set(request.requestId, request);
      try {
        this.send({ type: 'submit', request });
      } catch (error) {
        this.submitWaiters.delete(request.requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }).finally(() => {
      this.submitAcks.delete(request.requestId);
      this.pendingSubmits.delete(request.requestId);
    });
    this.submitAcks.set(request.requestId, acknowledged);
    return acknowledged;
  }

  status(requestId: string): void {
    this.subscriptions.add(requestId);
    this.send({ type: 'status', requestId });
  }

  cancel(requestId: string): void {
    this.subscriptions.add(requestId);
    this.send({ type: 'cancel', requestId });
  }

  retry(requestId: string): void {
    this.subscriptions.add(requestId);
    this.send({ type: 'retry', requestId });
  }

  /**
   * Hand over the release itself.
   *
   * Over HTTP, not the socket: it is the one large thing in this exchange, and
   * the helper streams it to disk while hashing it. Call after `submit` — the
   * helper refuses bytes for a request it has not been told about, because
   * otherwise it would have to take the uploader's word for what they are.
   */
  async upload(requestId: string, archive: Uint8Array | Blob): Promise<void> {
    const acknowledgement = this.submitAcks.get(requestId);
    if (acknowledgement) await acknowledgement;
    const doFetch = this.options.fetch ?? fetch;
    const response = await doFetch(`${this.options.endpoint.replace(/\/$/, '')}/build-inputs/${requestId}`, {
      method: 'POST',
      headers: { 'x-vne-build-token': this.options.token },
      body: archive as BodyInit,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(detail?.message ?? `The helper refused the upload (${response.status})`);
    }
  }

  async downloadArtifact(requestId: string, expected?: BuildArtifact): Promise<Blob> {
    const doFetch = this.options.fetch ?? fetch;
    const response = await doFetch(
      `${this.options.endpoint.replace(/\/$/, '')}/build-artifacts/${encodeURIComponent(requestId)}`,
      { method: 'GET', headers: { 'x-vne-build-token': this.options.token } },
    );
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(detail?.message ?? `The artifact is unavailable (${response.status})`);
    }
    const artifact = await response.blob();
    if (expected) {
      if (artifact.size !== expected.bytes) {
        throw new Error(`The downloaded artifact is ${artifact.size} bytes; expected ${expected.bytes}.`);
      }
      if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify the downloaded artifact.');
      const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', await readBlobBytes(artifact)));
      const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (sha256 !== expected.sha256) {
        throw new Error('The downloaded artifact does not match the helper\'s verified hash.');
      }
    }
    return artifact;
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.ready = false;
    this.queued.length = 0;
    this.subscriptions.clear();
    this.rejectPending(new Error('Build client closed'));
    this.submitAcks.clear();
  }
}

/** The states worth showing as "still working". */
export function isBuildInFlight(job: BuildJobSummary): boolean {
  return !['succeeded', 'failed', 'cancelled', 'expired'].includes(job.state);
}
