import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeEnvelope,
  type BridgeErrorCode,
  isServerMessage,
  makeEnvelope,
  maxBytesForEnvelope,
  parseEnvelope,
} from './bridge-protocol';

export type { BridgeProvider } from './bridge-protocol';

export type BridgeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unauthorized' | 'error' | 'closed';
export type BridgeConnectionReason =
  | 'CONNECTION_FAILED_OR_ORIGIN'
  | 'INVALID_TOKEN'
  | 'SESSION_ALREADY_ACTIVE'
  | 'PROTOCOL_VERSION_MISMATCH';
export type ToolResult =
  | { ok: true; result: unknown; binaryTool?: boolean }
  | { ok: false; errorCode: BridgeErrorCode; errorMessage: string; details?: unknown; binaryTool?: boolean };

export interface BridgeClientOptions {
  url: string;
  token: string;
  locale?: string;
  onEvent: (msg: BridgeEnvelope) => void;
  onToolCall: (toolCallId: string, toolName: string, input: unknown) => Promise<ToolResult>;
  onConnectionChange: (state: BridgeConnectionState, reason?: BridgeConnectionReason) => void;
  logger?: (message: string, error?: unknown) => void;
}

type QueuedUserMessage = { text: string; context?: unknown };

export class BridgeClient {
  private socket: WebSocket | null = null;
  private sessionId = '';
  private intentionallyClosed = false;
  private reconnectBlocked = false;
  private socketFailed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly queue: QueuedUserMessage[] = [];

  constructor(private readonly options: BridgeClientOptions) {}

  static clearPersistedSession(url: string): void {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(BridgeClient.sessionStorageKey(url));
    } catch {
      // Persistence is an optional resume optimization.
    }
  }

  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    this.intentionallyClosed = false;
    this.reconnectBlocked = false;
    this.clearReconnectTimer();
    this.openSocket(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
  }

  sendUserMessage(text: string, context?: unknown): void {
    if (this.isOpen()) {
      this.send('user_message', context === undefined ? { text } : { text, context });
      return;
    }
    if (!this.intentionallyClosed) {
      if (this.queue.length >= 20) this.queue.shift();
      this.queue.push(context === undefined ? { text } : { text, context });
    }
  }

  interrupt(): void {
    if (this.isOpen()) this.send('interrupt', {});
  }

  acknowledgeImageResult(requestId: string): void {
    if (requestId && this.isOpen()) this.send('image_result_ack', { requestId });
  }

  close(): void {
    this.intentionallyClosed = true;
    this.reconnectBlocked = true;
    this.clearAllTimers();
    const socket = this.socket;
    if (socket?.readyState === WebSocket.OPEN) this.send('session_end', {});
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    this.sessionId = '';
    this.reconnectAttempt = 0;
    this.socketFailed = false;
    this.queue.length = 0;
    BridgeClient.clearPersistedSession(this.options.url);
    this.options.onConnectionChange('closed');
  }

  private openSocket(state: 'connecting' | 'reconnecting'): void {
    this.clearHeartbeatTimers();
    this.options.onConnectionChange(state);
    const socket = new WebSocket(this.options.url);
    this.socketFailed = false;
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket || this.intentionallyClosed) return;
      const persistedSessionId = this.readPersistedSessionId();
      const resumeSessionId = this.sessionId || persistedSessionId;
      const payload = resumeSessionId
        ? { token: this.options.token, resumeSessionId, context: { locale: this.options.locale } }
        : { token: this.options.token, context: { locale: this.options.locale } };
      this.send('session_start', payload);
    };
    socket.onmessage = (event: MessageEvent<unknown>) => this.handleMessage(event.data);
    socket.onerror = (event: Event) => {
      this.socketFailed = true;
      this.options.logger?.('WebSocket error', event);
      this.options.onConnectionChange('error', 'CONNECTION_FAILED_OR_ORIGIN');
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.clearHeartbeatTimers();
      if (!this.intentionallyClosed && !this.reconnectBlocked) this.scheduleReconnect(!this.socketFailed);
    };
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    const parsed = parseEnvelope(data);
    if ('parseError' in parsed) {
      this.reportProtocolVersionError(data);
      return;
    }
    if (!isServerMessage(parsed)) return;
    if (parsed.type === 'pong') {
      this.clearPongTimer();
      return;
    }
    if (parsed.type === 'session_started' && this.isRecord(parsed.payload)
      && typeof parsed.payload.sessionId === 'string') {
      this.sessionId = parsed.payload.sessionId;
      this.persistSessionId(this.sessionId);
      this.reconnectAttempt = 0;
      this.options.onConnectionChange('connected');
      this.startHeartbeat();
      this.flushQueue();
    }
    if (parsed.type === 'error' && this.isRecord(parsed.payload)) {
      if (parsed.payload.code === 'UNAUTHORIZED') {
        this.blockReconnect('unauthorized', 'INVALID_TOKEN');
        return;
      }
      if (parsed.payload.code === 'PROVIDER_UNAVAILABLE'
        && this.isRecord(parsed.payload.details)
        && parsed.payload.details.reason === 'SESSION_ALREADY_ACTIVE') {
        this.blockReconnect('error', 'SESSION_ALREADY_ACTIVE');
        return;
      }
      if (parsed.payload.code === 'PROTOCOL_ERROR') {
        this.blockReconnect('error', 'PROTOCOL_VERSION_MISMATCH');
        return;
      }
    }
    this.options.onEvent(parsed);
    if (parsed.type === 'tool_call') void this.handleToolCall(parsed.payload);
  }

  private reportProtocolVersionError(raw: string): void {
    try {
      const value: unknown = JSON.parse(raw);
      if (this.isRecord(value) && value.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
        this.blockReconnect('error', 'PROTOCOL_VERSION_MISMATCH');
      }
    } catch (error: unknown) {
      this.options.logger?.('Invalid bridge message', error);
    }
  }

  private async handleToolCall(payload: unknown): Promise<void> {
    if (!this.isRecord(payload) || typeof payload.toolCallId !== 'string'
      || typeof payload.toolName !== 'string') return;
    let result: ToolResult;
    try {
      result = await this.options.onToolCall(payload.toolCallId, payload.toolName, payload.input);
    } catch (error: unknown) {
      result = {
        ok: false,
        errorCode: 'VALIDATION_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
    if (this.isOpen()) this.send('tool_result', { toolCallId: payload.toolCallId, ...result });
  }

  private startHeartbeat(): void {
    this.clearHeartbeatTimers();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isOpen()) return;
      this.send('ping', {});
      this.clearPongTimer();
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        const socket = this.socket;
        if (socket && socket.readyState === WebSocket.OPEN) socket.close();
      }, 10_000);
    }, 15_000);
  }

  private scheduleReconnect(reportState = true): void {
    if (this.intentionallyClosed || this.reconnectBlocked || this.reconnectTimer) return;
    if (reportState) this.options.onConnectionChange('reconnecting');
    const baseDelay = Math.min(500 * 2 ** this.reconnectAttempt, 15_000);
    this.reconnectAttempt += 1;
    const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionallyClosed && !this.reconnectBlocked) this.openSocket('reconnecting');
    }, delay);
  }

  private flushQueue(): void {
    while (this.queue.length > 0 && this.isOpen()) {
      const message = this.queue.shift();
      if (message) this.send('user_message', message);
    }
  }

  private send(type: Parameters<typeof makeEnvelope>[0], payload: unknown): void {
    if (!this.isOpen()) return;
    const raw = JSON.stringify(makeEnvelope(type, payload, this.sessionId));
    if (new TextEncoder().encode(raw).byteLength <= maxBytesForEnvelope(type, payload)) this.socket?.send(raw);
  }

  private readPersistedSessionId(): string {
    try {
      return typeof sessionStorage === 'undefined'
        ? ''
        : (sessionStorage.getItem(BridgeClient.sessionStorageKey(this.options.url)) ?? '');
    }
    catch { return ''; }
  }

  private persistSessionId(sessionId: string): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(BridgeClient.sessionStorageKey(this.options.url), sessionId);
      }
    }
    catch { /* Persistence is an optional resume optimization. */ }
  }

  private static sessionStorageKey(url: string): string {
    return `vne-bridge-session:${url}`;
  }

  private blockReconnect(state: 'unauthorized' | 'error', reason: BridgeConnectionReason): void {
    this.reconnectBlocked = true;
    this.clearAllTimers();
    this.sessionId = '';
    this.reconnectAttempt = 0;
    BridgeClient.clearPersistedSession(this.options.url);
    this.options.onConnectionChange(state, reason);
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  }

  private isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private clearPongTimer(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private clearHeartbeatTimers(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.clearPongTimer();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearAllTimers(): void {
    this.clearHeartbeatTimers();
    this.clearReconnectTimer();
  }
}
