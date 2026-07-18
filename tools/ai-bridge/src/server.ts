import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_IMAGE_MESSAGE_BYTES, MAX_MESSAGE_BYTES, makeEnvelope, parseEnvelope, type BridgeEnvelope, type BridgeErrorCode, type BridgeProvider, type SessionChallengePayload } from '../../../lib/bridge-protocol';
import { getBridgeTool } from '../../../lib/ai/bridge-tools';
import { BridgeToolError, ProviderFailure, type AgentProvider, type AgentProviderFactory } from './provider';
import { BridgeToolRuntime } from './tool-runtime';
import { createImageToolHandlers } from './image-tools';
import { normalizeAllowedOrigins } from './origin-policy';
import { getCodexHardeningCapability } from './codex-launch-policy';
import { validateCodexBetaConsent } from '../../../lib/ai/codex-beta-consent';

const TURN_TIMEOUT_MS = 120_000;
const TOOL_TIMEOUT_MS = 30_000;
const PATCH_TIMEOUT_MS = 600_000;
const MAX_TOOL_CALLS = 15;
type PendingTool = { toolName: string; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
type LiveSession = {
  id: string;
  provider: AgentProvider;
  socket: WebSocket | null;
  generating: boolean;
  interruptReason: 'user' | 'timeout' | null;
  resetting: boolean;
  toolCalls: number;
  turn: Promise<void> | null;
};

export interface BridgeServerOptions { port?: number; token?: string; allowedOrigins?: string[]; provider?: BridgeProvider; enableCodexBeta?: boolean; providerFactory: AgentProviderFactory; logger?: (line: string) => void; toolTimeoutMs?: number; turnTimeoutMs?: number }

export class AiBridgeServer {
  readonly token: string;
  private server: WebSocketServer | null = null;
  private session: LiveSession | null = null;
  private readonly pendingTools = new Map<string, PendingTool>();
  private readonly allowedOrigins: Set<string>;
  private readonly log: (line: string) => void;
  private readonly toolRuntime: BridgeToolRuntime;

  constructor(private readonly options: BridgeServerOptions) {
    this.token = options.token ?? randomBytes(24).toString('hex');
    this.allowedOrigins = new Set(normalizeAllowedOrigins(options.allowedOrigins));
    this.log = options.logger ?? console.log;
    this.toolRuntime = new BridgeToolRuntime({
      callApp: (name, input, timeout) => this.callClientTool(name, input, timeout),
      emit: (type, payload) => this.sendCurrent(type, payload),
      logger: this.log,
    });
    this.toolRuntime.setHandlers(createImageToolHandlers({ logger: this.log, debug: process.env.AI_BRIDGE_DEBUG === 'true' }));
  }

  async start(): Promise<number> {
    this.server = new WebSocketServer({
      host: '127.0.0.1', port: this.options.port ?? 8787, maxPayload: MAX_IMAGE_MESSAGE_BYTES,
      verifyClient: ({ origin }: { origin: string; req: IncomingMessage }) => this.allowedOrigins.has(origin),
    });
    this.server.on('connection', socket => this.handleConnection(socket));
    this.server.on('wsClientError', (_error, socket) => socket.destroy());
    await new Promise<void>((resolve, reject) => { this.server?.once('listening', resolve); this.server?.once('error', reject); });
    const address = this.server.address();
    const port = typeof address === 'object' && address ? address.port : (this.options.port ?? 8787);
    return port;
  }

  async close(): Promise<void> {
    this.session?.provider.abort();
    await this.session?.provider.close?.();
    for (const pending of this.pendingTools.values()) { clearTimeout(pending.timer); pending.reject(new Error('Bridge shutting down')); }
    this.pendingTools.clear();
    for (const client of this.server?.clients ?? []) client.close(1001, 'Server shutting down');
    if (this.server) await new Promise<void>(resolve => this.server?.close(() => resolve()));
    this.server = null;
  }

  private handleConnection(socket: WebSocket): void {
    let authenticated = false;
    socket.on('message', (data, isBinary) => {
      const raw = data.toString();
      const byteLength = new TextEncoder().encode(raw).byteLength;
      if (isBinary || byteLength > MAX_IMAGE_MESSAGE_BYTES) return this.protocolClose(socket, `Message exceeds ${MAX_IMAGE_MESSAGE_BYTES} bytes`);
      const parsed = parseEnvelope(raw);
      if ('parseError' in parsed) return this.protocolClose(socket, parsed.parseError);
      if (byteLength > MAX_MESSAGE_BYTES && !this.isAuthorizedLargeToolResult(parsed)) return this.protocolClose(socket, 'Oversized tool result is not authorized');
      if (!authenticated) {
        if (parsed.type !== 'session_start' || !this.validToken(parsed.payload)) return this.errorAndClose(socket, 'UNAUTHORIZED', 'Invalid bridge token');
        authenticated = this.startSession(socket, parsed);
        return;
      }
      this.handleMessage(socket, parsed);
    });
    socket.on('close', () => { if (this.session?.socket === socket) this.session.socket = null; });
  }

  private startSession(socket: WebSocket, message: BridgeEnvelope): boolean {
    const payload = this.record(message.payload);
    const challenge = this.preflightChallenge(payload);
    if (challenge) {
      this.send(socket, 'session_challenge', challenge);
      return false;
    }
    const resumeId = typeof payload?.resumeSessionId === 'string' ? payload.resumeSessionId : undefined;
    if (this.session) {
      if (this.session.socket?.readyState === WebSocket.OPEN && resumeId !== this.session.id) {
        this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'Another session is already active', { reason: 'SESSION_ALREADY_ACTIVE' });
        socket.close();
        return false;
      }
      if (resumeId !== this.session.id) this.disposeSession();
      else {
        this.session.socket?.close(1000, 'Session resumed elsewhere');
        this.session.socket = socket;
        this.send(socket, 'session_started', { sessionId: this.session.id, resumed: true, provider: this.options.provider ?? 'claude' }, this.session.id);
        this.toolRuntime.reemitBufferedImages();
        return true;
      }
    }
    const id = randomUUID();
    const tools = this.toolRuntime;
    const locale = typeof payload?.context === 'object' && payload.context !== null
      && typeof (payload.context as Record<string, unknown>).locale === 'string'
      ? (payload.context as Record<string, unknown>).locale as string
      : undefined;
    this.session = {
      id,
      provider: this.options.providerFactory(tools, { locale }),
      socket,
      generating: false,
      interruptReason: null,
      resetting: false,
      toolCalls: 0,
      turn: null,
    };
    this.send(socket, 'session_started', { sessionId: id, resumed: false, provider: this.options.provider ?? 'claude' }, id);
    return true;
  }

  private preflightChallenge(payload: Record<string, unknown> | null): SessionChallengePayload | null {
    const provider = this.options.provider ?? 'claude';
    if (provider === 'openai' && !process.env.OPENAI_API_KEY?.trim()) {
      return { provider, reason: 'OPENAI_API_KEY_MISSING', retryable: true };
    }
    if (provider === 'codex') {
      if (!this.options.enableCodexBeta) return { provider, reason: 'CODEX_HARDENING_UNSUPPORTED', retryable: false };
      const capability = getCodexHardeningCapability();
      if (!capability.supported) return { provider, reason: capability.reason, retryable: false };
      const consent = this.record(payload?.codexBetaConsent) ?? undefined;
      if (!validateCodexBetaConsent(consent, capability)) {
        return { provider, reason: 'CODEX_BETA_CONSENT_REQUIRED', retryable: true };
      }
    }
    return null;
  }

  private handleMessage(socket: WebSocket, message: BridgeEnvelope): void {
    if (!this.session || socket !== this.session.socket || (message.sessionId && message.sessionId !== this.session.id)) return this.protocolClose(socket, 'Invalid session');
    if (message.type === 'ping') return this.send(socket, 'pong', {}, this.session.id);
    if (message.type === 'session_end') { this.disposeSession(); return; }
    if (message.type === 'interrupt') { this.session.interruptReason = 'user'; this.session.provider.abort(); return; }
    if (message.type === 'conversation_reset') {
      if (this.session.resetting) {
        return this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'Conversation reset is already running', { reason: 'RESET_ALREADY_RUNNING' });
      }
      void this.resetConversation(this.session, message.requestId);
      return;
    }
    if (message.type === 'tool_result') return this.resolveTool(message.payload);
    if (message.type === 'image_result_ack') {
      const requestId = this.record(message.payload)?.requestId;
      if (typeof requestId === 'string') this.toolRuntime.acknowledgeImage(requestId);
      return;
    }
    if (message.type !== 'user_message') return this.protocolClose(socket, 'Unexpected client message');
    const text = this.record(message.payload)?.text;
    if (typeof text !== 'string' || !text.trim()) return this.protocolClose(socket, 'user_message.text must be a non-empty string');
    if (this.session.generating) {
      return this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'A turn is already running', { reason: 'TURN_ALREADY_RUNNING' });
    }
    this.session.turn = this.runTurn(text);
  }

  private async resetConversation(session: LiveSession, requestId: string): Promise<void> {
    session.resetting = true;
    try {
      if (session.generating) {
        session.interruptReason = 'user';
        session.provider.abort();
        await session.turn;
      }
      await session.provider.resetConversation();
      if (this.session === session) this.sendCurrent('conversation_reset_ack', { requestId });
    } catch (error) {
      if (this.session === session) {
        this.sendCurrent('error', {
          code: 'PROVIDER_UNAVAILABLE',
          message: this.safeError(error),
          details: { reason: 'CONVERSATION_RESET_FAILED', requestId },
        });
      }
    } finally {
      session.resetting = false;
    }
  }

  private async runTurn(text: string): Promise<void> {
    const session = this.session!;
    session.generating = true; session.interruptReason = null; session.toolCalls = 0;
    this.toolRuntime.beginTurn();
    const timer = setTimeout(() => { session.interruptReason = 'timeout'; session.provider.abort(); }, this.options.turnTimeoutMs ?? TURN_TIMEOUT_MS);
    try {
      for await (const event of session.provider.send(text)) {
        if (session.interruptReason) break;
        if (event.type === 'text') this.sendCurrent('assistant_delta', { text: event.text });
        if (event.type === 'done') this.sendCurrent('assistant_done', {
          stopReason: event.stopReason ?? 'end_turn',
          ...(event.diagnostics ? { diagnostics: event.diagnostics } : {}),
        });
      }
      if (session.interruptReason) this.sendCurrent('assistant_done', { stopReason: session.interruptReason === 'timeout' ? 'timeout' : 'interrupted' });
    } catch (error) {
      if (session.interruptReason) this.sendCurrent('assistant_done', { stopReason: session.interruptReason === 'timeout' ? 'timeout' : 'interrupted' });
      else this.sendCurrent('error', {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'The AI provider could not complete the request',
        details: { reason: error instanceof ProviderFailure ? error.reason : 'PROVIDER_ERROR' },
      });
    } finally {
      clearTimeout(timer);
      session.generating = false;
      session.turn = null;
    }
  }

  private callClientTool(toolName: string, input: unknown, timeoutMs?: number): Promise<unknown> {
    const session = this.session;
    if (!session?.socket) return Promise.reject(new Error('App disconnected'));
    session.toolCalls += 1;
    if (session.toolCalls > MAX_TOOL_CALLS) {
      session.provider.abort();
      this.sendCurrent('assistant_done', { stopReason: 'tool_limit' });
      this.sendCurrent('error', {
        code: 'PROVIDER_UNAVAILABLE',
        message: `Tool call limit (${MAX_TOOL_CALLS}) exceeded`,
        details: { reason: 'TOOL_LIMIT_EXCEEDED' },
      });
      return Promise.reject(new Error('Tool call limit exceeded'));
    }
    const toolCallId = randomUUID();
    this.sendCurrent('tool_call', { toolCallId, toolName, input });
    const timeout = timeoutMs ?? (toolName === 'propose_scene_patch' ? PATCH_TIMEOUT_MS : (this.options.toolTimeoutMs ?? TOOL_TIMEOUT_MS));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingTools.delete(toolCallId); reject(new Error(`Tool ${toolName} timed out`)); }, timeout);
      this.pendingTools.set(toolCallId, { toolName, resolve, reject, timer });
    });
  }

  private resolveTool(payload: unknown): void {
    const value = this.record(payload); const id = value?.toolCallId;
    if (typeof id !== 'string') return;
    const pending = this.pendingTools.get(id); if (!pending) return;
    clearTimeout(pending.timer); this.pendingTools.delete(id);
    if (value?.ok === true) pending.resolve(value.result);
    else pending.reject(new BridgeToolError(
      typeof value?.errorCode === 'string' ? value.errorCode : 'VALIDATION_FAILED',
      typeof value?.errorMessage === 'string' ? value.errorMessage : 'Tool failed',
      value?.details,
    ));
  }

  private isAuthorizedLargeToolResult(message: BridgeEnvelope): boolean {
    if (message.type !== 'tool_result') return false;
    const value = this.record(message.payload);
    const pending = typeof value?.toolCallId === 'string' ? this.pendingTools.get(value.toolCallId) : undefined;
    return value?.binaryTool === true && !!pending && getBridgeTool(pending.toolName)?.binaryResult === true;
  }

  private disposeSession(): void {
    const session = this.session;
    if (!session) return;
    session.provider.abort();
    void session.provider.close?.();
    for (const pending of this.pendingTools.values()) { clearTimeout(pending.timer); pending.reject(new Error('Session ended')); }
    this.pendingTools.clear();
    this.session = null;
  }

  private validToken(payload: unknown): boolean {
    const candidate = this.record(payload)?.token;
    if (typeof candidate !== 'string') return false;
    const encoder = new TextEncoder(); const a = encoder.encode(candidate); const b = encoder.encode(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  private record(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null; }
  private safeError(error: unknown): string {
    let message = (error instanceof Error ? error.message : 'Provider failed').replaceAll(this.token, '[REDACTED]');
    if (process.env.OPENAI_API_KEY) message = message.replaceAll(process.env.OPENAI_API_KEY, '[REDACTED]');
    return message.replace(/(?:sk-(?:ant-)?|(?:ANTHROPIC|OPENAI)_API_KEY\s*[=:]\s*)\S+/gi, '[REDACTED]');
  }
  private sendCurrent(type: Parameters<typeof makeEnvelope>[0], payload: unknown): void { if (this.session?.socket) this.send(this.session.socket, type, payload, this.session.id); }
  private send(socket: WebSocket, type: Parameters<typeof makeEnvelope>[0], payload: unknown, id = ''): void { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(makeEnvelope(type, payload, id))); }
  private sendError(socket: WebSocket, code: BridgeErrorCode, message: string, details?: unknown): void {
    this.send(socket, 'error', details === undefined ? { code, message } : { code, message, details }, this.session?.id ?? '');
  }
  private errorAndClose(socket: WebSocket, code: BridgeErrorCode, message: string, details?: unknown): void {
    this.sendError(socket, code, message, details);
    socket.close(1008, message);
  }
  private protocolClose(socket: WebSocket, message: string): void { this.errorAndClose(socket, 'PROTOCOL_ERROR', message); }
}
