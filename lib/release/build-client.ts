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

  constructor(private readonly options: BuildClientOptions) {}

  async connect(): Promise<void> {
    const create = this.options.createSocket ?? ((url: string) => new WebSocket(url));
    const socket = create(buildSocketUrl(this.options.endpoint));
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('Could not reach the build helper'));
    });

    socket.onmessage = (event: MessageEvent) => {
      let message: BuildServerMessage;
      try {
        message = JSON.parse(String(event.data)) as BuildServerMessage;
      } catch {
        return;
      }
      if (message.type === 'ready') {
        this.ready = true;
        // Anything asked for before the handshake finished goes now, in order.
        for (const frame of this.queued.splice(0)) socket.send(frame);
        return;
      }
      this.options.onMessage(message);
    };
    socket.onclose = (event: CloseEvent) => {
      this.ready = false;
      this.options.onClose?.(event.reason || 'closed');
    };

    this.send({ type: 'hello', version: BUILD_PROTOCOL_VERSION, token: this.options.token });
  }

  private send(message: unknown): void {
    const frame = JSON.stringify(message);
    if (!this.socket) throw new Error('The build client is not connected');
    if (!this.ready && (message as { type?: string }).type !== 'hello') {
      this.queued.push(frame);
      return;
    }
    this.socket.send(frame);
  }

  submit(request: BuildRequest): void {
    this.send({ type: 'submit', request });
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

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.ready = false;
  }
}

/** The states worth showing as "still working". */
export function isBuildInFlight(job: BuildJobSummary): boolean {
  return !['succeeded', 'failed', 'cancelled', 'expired'].includes(job.state);
}
