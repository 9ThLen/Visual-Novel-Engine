import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeEnvelope,
  type BridgeErrorCode,
  isServerMessage,
  makeEnvelope,
  parseEnvelope,
} from './bridge-protocol';

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'closed';
type ToolResult =
  | { ok: true; result: unknown }
  | { ok: false; errorCode: BridgeErrorCode; errorMessage: string };

export interface BridgeClientOptions {
  url: string;
  token: string;
  onEvent: (msg: BridgeEnvelope) => void;
  onToolCall: (toolCallId: string, toolName: string, input: unknown) => Promise<ToolResult>;
  onConnectionChange: (state: ConnectionState) => void;
  logger?: (message: string, error?: unknown) => void;
}

type QueuedUserMessage = { text: string; context?: unknown };

export class BridgeClient {
  private socket: WebSocket | null = null;
  private sessionId = '';
  private intentionallyClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly queue: QueuedUserMessage[] = [];

  constructor(private readonly options: BridgeClientOptions) {}

  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    this.intentionallyClosed = false;
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

  close(): void {
    this.intentionallyClosed = true;
    this.clearAllTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    this.options.onConnectionChange('closed');
  }

  private openSocket(state: 'connecting' | 'reconnecting'): void {
    this.clearHeartbeatTimers();
    this.options.onConnectionChange(state);
    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket || this.intentionallyClosed) return;
      this.options.onConnectionChange('connected');
      const payload = this.sessionId
        ? { token: this.options.token, resumeSessionId: this.sessionId }
        : { token: this.options.token };
      this.send('session_start', payload);
      this.reconnectAttempt = 0;
      this.startHeartbeat();
      this.flushQueue();
    };
    socket.onmessage = (event: MessageEvent<unknown>) => this.handleMessage(event.data);
    socket.onerror = (event: Event) => this.options.logger?.('WebSocket error', event);
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.clearHeartbeatTimers();
      if (!this.intentionallyClosed) this.scheduleReconnect();
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
    }
    this.options.onEvent(parsed);
    if (parsed.type === 'tool_call') void this.handleToolCall(parsed.payload);
  }

  private reportProtocolVersionError(raw: string): void {
    try {
      const value: unknown = JSON.parse(raw);
      if (this.isRecord(value) && value.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
        this.options.onEvent(makeEnvelope('error', {
          code: 'PROTOCOL_ERROR',
          message: `Unsupported protocol version: ${String(value.protocolVersion)}`,
        }, this.sessionId));
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

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || this.reconnectTimer) return;
    this.options.onConnectionChange('reconnecting');
    const baseDelay = Math.min(500 * 2 ** this.reconnectAttempt, 15_000);
    this.reconnectAttempt += 1;
    const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionallyClosed) this.openSocket('reconnecting');
    }, delay);
  }

  private flushQueue(): void {
    while (this.queue.length > 0 && this.isOpen()) {
      const message = this.queue.shift();
      if (message) this.send('user_message', message);
    }
  }

  private send(type: Parameters<typeof makeEnvelope>[0], payload: unknown): void {
    if (this.isOpen()) this.socket?.send(JSON.stringify(makeEnvelope(type, payload, this.sessionId)));
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
