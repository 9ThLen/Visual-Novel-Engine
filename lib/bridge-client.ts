import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeEnvelope,
  type BridgeErrorCode,
  type BridgeProvider,
  type CodexBetaConsent,
  type WireAttachment,
  isServerMessage,
  makeEnvelope,
  maxBytesForEnvelope,
  parseEnvelope,
} from './bridge-protocol';

export type { BridgeProvider } from './bridge-protocol';

export type BridgeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'challenge' | 'unauthorized' | 'error' | 'closed';
export type BridgeConnectionReason =
  | 'CONNECTION_FAILED_OR_ORIGIN'
  | 'INVALID_TOKEN'
  | 'SESSION_ALREADY_ACTIVE'
  | 'PROTOCOL_VERSION_MISMATCH';
export type ToolResult =
  | { ok: true; result: unknown; binaryTool?: boolean }
  | { ok: false; errorCode: BridgeErrorCode; errorMessage: string; details?: unknown; binaryTool?: boolean };
export type BridgeDeliveryResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_AUTHENTICATED' | 'MESSAGE_TOO_LARGE' | 'SERIALIZATION_FAILED' | 'DELIVERY_FAILED' };
export type BridgeConversationResetResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_AUTHENTICATED' | 'RESET_FAILED' };

export interface BridgeClientOptions {
  url: string;
  token: string;
  locale?: string;
  preferredProvider?: BridgeProvider;
  codexBetaConsent?: CodexBetaConsent;
  requestedModel?: string;
  requestedTokenBudget?: number;
  onEvent: (msg: BridgeEnvelope) => void;
  onToolCall: (toolCallId: string, toolName: string, input: unknown, context?: { untrustedAttachmentMode: boolean }) => Promise<ToolResult>;
  onConnectionChange: (state: BridgeConnectionState, reason?: BridgeConnectionReason) => void;
  logger?: (message: string, error?: unknown) => void;
}

export class BridgeClient {
  private socket: WebSocket | null = null;
  private sessionId = '';
  private intentionallyClosed = false;
  private reconnectBlocked = false;
  private authenticated = false;
  private socketFailed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReset: ((result: BridgeConversationResetResult) => void) | null = null;
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

  sendUserMessage(text: string, attachments?: WireAttachment[]): BridgeDeliveryResult {
    if (!this.authenticated || !this.isOpen()) return { ok: false, reason: 'NOT_AUTHENTICATED' };
    return this.send('user_message', { text, ...(attachments?.length ? { attachments } : {}) });
  }

  interrupt(): BridgeDeliveryResult {
    if (!this.authenticated || !this.isOpen()) return { ok: false, reason: 'NOT_AUTHENTICATED' };
    this.send('interrupt', {});
    return { ok: true };
  }

  resetConversation(): Promise<BridgeConversationResetResult> {
    if (!this.authenticated || !this.isOpen()) {
      return Promise.resolve({ ok: false, reason: 'NOT_AUTHENTICATED' });
    }
    if (this.pendingReset) return Promise.resolve({ ok: false, reason: 'RESET_FAILED' });
    this.send('conversation_reset', {});
    return new Promise((resolve) => { this.pendingReset = resolve; });
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
    this.authenticated = false;
    this.reconnectAttempt = 0;
    this.socketFailed = false;
    this.resolvePendingReset({ ok: false, reason: 'RESET_FAILED' });
    BridgeClient.clearPersistedSession(this.options.url);
    this.options.onConnectionChange('closed');
  }

  private openSocket(state: 'connecting' | 'reconnecting'): void {
    this.clearHeartbeatTimers();
    this.options.onConnectionChange(state);
    const socket = new WebSocket(this.options.url);
    this.authenticated = false;
    this.socketFailed = false;
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket || this.intentionallyClosed) return;
      const persistedSessionId = this.readPersistedSessionId();
      const resumeSessionId = this.sessionId || persistedSessionId;
      const payload = {
        token: this.options.token,
        ...(resumeSessionId ? { resumeSessionId } : {}),
        ...(this.options.preferredProvider ? { preferredProvider: this.options.preferredProvider } : {}),
        ...(this.options.codexBetaConsent ? { codexBetaConsent: this.options.codexBetaConsent } : {}),
        ...(this.options.requestedModel ? { requestedModel: this.options.requestedModel } : {}),
        ...(this.options.requestedTokenBudget ? { requestedTokenBudget: this.options.requestedTokenBudget } : {}),
        context: { locale: this.options.locale },
      };
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
      this.authenticated = false;
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
      this.authenticated = true;
      this.persistSessionId(this.sessionId);
      this.reconnectAttempt = 0;
      this.options.onConnectionChange('connected');
      this.startHeartbeat();
    }
    if (parsed.type === 'conversation_reset_ack') {
      this.resolvePendingReset({ ok: true });
    }
    if (parsed.type === 'session_challenge') {
      this.blockReconnect('challenge');
      this.options.onEvent(parsed);
      return;
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
      if (this.isRecord(parsed.payload.details)
        && parsed.payload.details.reason === 'CONVERSATION_RESET_FAILED') {
        this.resolvePendingReset({ ok: false, reason: 'RESET_FAILED' });
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
      result = await this.options.onToolCall(payload.toolCallId, payload.toolName, payload.input, {
        untrustedAttachmentMode: payload.untrustedAttachmentMode === true,
      });
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

  private send(type: Parameters<typeof makeEnvelope>[0], payload: unknown): BridgeDeliveryResult {
    if (!this.isOpen()) return { ok: false, reason: 'NOT_AUTHENTICATED' };
    let raw: string;
    try { raw = JSON.stringify(makeEnvelope(type, payload, this.sessionId)); }
    catch { return { ok: false, reason: 'SERIALIZATION_FAILED' }; }
    if (new TextEncoder().encode(raw).byteLength > maxBytesForEnvelope(type, payload)) return { ok: false, reason: 'MESSAGE_TOO_LARGE' };
    // The readyState guard above cannot make send() safe on every platform:
    // React Native's WebSocket throws where the browser only warns. Reporting
    // {ok:true} there would strand the caller waiting on a reply the bridge
    // never received.
    try { this.socket?.send(raw); }
    catch { return { ok: false, reason: 'DELIVERY_FAILED' }; }
    return { ok: true };
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

  private blockReconnect(state: 'challenge' | 'unauthorized' | 'error', reason?: BridgeConnectionReason): void {
    this.reconnectBlocked = true;
    this.clearAllTimers();
    this.sessionId = '';
    this.authenticated = false;
    this.resolvePendingReset({ ok: false, reason: 'RESET_FAILED' });
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

  private resolvePendingReset(result: BridgeConversationResetResult): void {
    const resolve = this.pendingReset;
    this.pendingReset = null;
    resolve?.(result);
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
