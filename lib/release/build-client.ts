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
import type { BuildJobSummary } from '@/lib/release/build-job';

export interface BuildClientOptions {
  /** e.g. `http://127.0.0.1:8790`. The socket url is derived from it. */
  endpoint: string;
  token: string;
  onMessage: (message: BuildServerMessage) => void;
  onClose?: (reason: string) => void;
  /** Injectable for tests; defaults to the platform's. */
  createSocket?: (url: string) => WebSocket;
  fetch?: typeof fetch;
}

export function buildSocketUrl(endpoint: string): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/';
  return url.toString();
}

export class BuildClient {
  private socket: WebSocket | null = null;
  private ready = false;
  private readonly queued: string[] = [];
  private readonly submitAcks = new Map<string, Promise<BuildJobSummary>>();
  private readonly submitWaiters = new Map<string, {
    resolve: (job: BuildJobSummary) => void;
    reject: (error: Error) => void;
  }>();

  constructor(private readonly options: BuildClientOptions) {}

  async connect(): Promise<void> {
    const create = this.options.createSocket ?? ((url: string) => new WebSocket(url));
    const socket = create(buildSocketUrl(this.options.endpoint));
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Build helper pairing timed out')), 5_000);
      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'hello',
          version: BUILD_PROTOCOL_VERSION,
          token: this.options.token,
        }));
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Could not reach the build helper'));
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
            reject(new Error(`Unsupported build protocol ${message.version}`));
            socket.close();
            return;
          }
          clearTimeout(timeout);
          this.ready = true;
          for (const frame of this.queued.splice(0)) socket.send(frame);
          resolve();
          return;
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
        this.ready = false;
        const error = new Error(event.reason || 'Build helper connection closed');
        for (const waiter of this.submitWaiters.values()) waiter.reject(error);
        this.submitWaiters.clear();
        this.options.onClose?.(event.reason || 'closed');
      };
    });
  }

  private send(message: unknown): void {
    const frame = JSON.stringify(message);
    if (!this.socket) throw new Error('The build client is not connected');
    if (!this.ready) {
      this.queued.push(frame);
      return;
    }
    this.socket.send(frame);
  }

  submit(request: BuildRequest): Promise<BuildJobSummary> {
    const existing = this.submitAcks.get(request.requestId);
    if (existing) return existing;
    const acknowledged = new Promise<BuildJobSummary>((resolve, reject) => {
      this.submitWaiters.set(request.requestId, { resolve, reject });
      try {
        this.send({ type: 'submit', request });
      } catch (error) {
        this.submitWaiters.delete(request.requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }).finally(() => this.submitAcks.delete(request.requestId));
    this.submitAcks.set(request.requestId, acknowledged);
    return acknowledged;
  }

  status(requestId: string): void {
    this.send({ type: 'status', requestId });
  }

  cancel(requestId: string): void {
    this.send({ type: 'cancel', requestId });
  }

  retry(requestId: string): void {
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

  async downloadArtifact(requestId: string): Promise<Blob> {
    const doFetch = this.options.fetch ?? fetch;
    const response = await doFetch(
      `${this.options.endpoint.replace(/\/$/, '')}/build-artifacts/${encodeURIComponent(requestId)}`,
      { method: 'GET', headers: { 'x-vne-build-token': this.options.token } },
    );
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(detail?.message ?? `The artifact is unavailable (${response.status})`);
    }
    return response.blob();
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.ready = false;
    this.queued.length = 0;
  }
}

/** The states worth showing as "still working". */
export function isBuildInFlight(job: BuildJobSummary): boolean {
  return !['succeeded', 'failed', 'cancelled', 'expired'].includes(job.state);
}
