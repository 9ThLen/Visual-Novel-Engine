import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_IMAGE_MESSAGE_BYTES, MAX_MESSAGE_BYTES, makeEnvelope, parseEnvelope, type BridgeEnvelope, type BridgeErrorCode, type BridgeProvider, type SessionChallengePayload } from '../../../lib/bridge-protocol';
import { getBridgeTool } from '../../../lib/ai/bridge-tools';
import { BridgeToolError, ProviderFailure, type AgentAttachment, type AgentProvider, type AgentProviderFactory, type AgentUserInput } from './provider';
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
  untrustedAttachmentMode: boolean;
};

export interface BridgeServerOptions { port?: number; token?: string; allowedOrigins?: string[]; provider?: BridgeProvider; enableCodexBeta?: boolean; enableClaudeAttachments?: boolean; providerFactory: AgentProviderFactory; logger?: (line: string) => void; toolTimeoutMs?: number; turnTimeoutMs?: number; modelPolicy?: { defaultModel?: string; allowedModels?: string[]; defaultTokenBudget?: number; maxTokenBudget?: number } }

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
      if (byteLength > MAX_MESSAGE_BYTES && !this.isAuthorizedLargeMessage(parsed)) return this.protocolClose(socket, 'Oversized message is not authorized');
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
        this.send(socket, 'session_started', { sessionId: this.session.id, resumed: true, provider: this.options.provider ?? 'claude', capabilities: this.capabilities(), untrustedAttachmentMode: this.session.untrustedAttachmentMode }, this.session.id);
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
    const policy = this.resolveModelPolicy(payload);
    if (!policy.ok) {
      this.sendError(socket, 'VALIDATION_FAILED', 'Requested model or token budget is not allowed', { reason: policy.reason });
      socket.close();
      return false;
    }
    this.session = {
      id,
      provider: this.options.providerFactory(tools, { locale, model: policy.model, sessionTokenBudget: policy.tokenBudget }),
      socket,
      generating: false,
      interruptReason: null,
      resetting: false,
      toolCalls: 0,
      turn: null,
      untrustedAttachmentMode: false,
    };
    this.send(socket, 'session_started', { sessionId: id, resumed: false, provider: this.options.provider ?? 'claude', capabilities: this.capabilities(), untrustedAttachmentMode: false }, id);
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
    const decoded = this.decodeUserInput(message.payload);
    if (!decoded.ok) return this.sendError(socket, 'VALIDATION_FAILED', 'Invalid attachment payload', { reason: decoded.reason });
    if (decoded.input.attachments.length && !this.capabilities().attachments.supported) {
      return this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'Attachments are not supported by this provider', { reason: 'ATTACHMENTS_UNSUPPORTED' });
    }
    if (this.session.generating) {
      return this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'A turn is already running', { reason: 'TURN_ALREADY_RUNNING' });
    }
    if (decoded.input.attachments.length) this.session.untrustedAttachmentMode = true;
    this.session.turn = this.runTurn(decoded.input);
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
      session.untrustedAttachmentMode = false;
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

  private async runTurn(input: AgentUserInput): Promise<void> {
    const session = this.session!;
    session.generating = true; session.interruptReason = null; session.toolCalls = 0;
    this.toolRuntime.beginTurn();
    const timer = setTimeout(() => { session.interruptReason = 'timeout'; session.provider.abort(); }, this.options.turnTimeoutMs ?? TURN_TIMEOUT_MS);
    try {
      for await (const event of session.provider.send(input)) {
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

  private decodeUserInput(payload: unknown): { ok: true; input: AgentUserInput } | { ok: false; reason: string } {
    const value = this.record(payload);
    const text = typeof value?.text === 'string' ? value.text : '';
    const raw = value?.attachments;
    if (raw !== undefined && !Array.isArray(raw)) return { ok: false, reason: 'ATTACHMENTS_INVALID' };
    if (Array.isArray(raw) && raw.length > 4) return { ok: false, reason: 'ATTACHMENT_COUNT_EXCEEDED' };
    const attachments: AgentAttachment[] = [];
    let total = 0;
    for (const candidate of raw ?? []) {
      const item = this.record(candidate);
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.kind !== 'string'
        || typeof item.mimeType !== 'string' || typeof item.byteSize !== 'number' || typeof item.base64 !== 'string') return { ok: false, reason: 'ATTACHMENTS_INVALID' };
      let bytes: Uint8Array;
      try {
        const canonical = item.base64.replace(/\s/g, '');
        const buffer = Buffer.from(canonical, 'base64');
        if (buffer.toString('base64').replace(/=+$/, '') !== canonical.replace(/=+$/, '')) return { ok: false, reason: 'ATTACHMENT_BASE64_INVALID' };
        bytes = new Uint8Array(buffer);
      } catch { return { ok: false, reason: 'ATTACHMENT_BASE64_INVALID' }; }
      total += bytes.byteLength;
      if (bytes.byteLength !== item.byteSize || bytes.byteLength > 5_000_000 || total > 5_000_000) return { ok: false, reason: 'ATTACHMENT_SIZE_INVALID' };
      const detected = detectAttachmentBytes(bytes);
      if (!detected || detected.kind !== item.kind || detected.mimeType !== item.mimeType) return { ok: false, reason: 'ATTACHMENT_TYPE_INVALID' };
      attachments.push({ id: item.id, name: item.name.slice(0, 120), kind: detected.kind, mimeType: detected.mimeType, bytes });
    }
    if (!text.trim() && attachments.length === 0) return { ok: false, reason: 'EMPTY_MESSAGE' };
    return { ok: true, input: { text, attachments } };
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
    this.sendCurrent('tool_call', { toolCallId, toolName, input, untrustedAttachmentMode: session.untrustedAttachmentMode });
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

  private isAuthorizedLargeMessage(message: BridgeEnvelope): boolean {
    if (message.type === 'user_message') {
      const attachments = this.record(message.payload)?.attachments;
      return Array.isArray(attachments) && attachments.length > 0;
    }
    if (message.type !== 'tool_result') return false;
    const value = this.record(message.payload);
    const pending = typeof value?.toolCallId === 'string' ? this.pendingTools.get(value.toolCallId) : undefined;
    return value?.binaryTool === true && !!pending && getBridgeTool(pending.toolName)?.binaryResult === true;
  }

  private capabilities() {
    const supported = this.options.provider === 'openai'
      || (this.options.provider === 'claude' && this.options.enableClaudeAttachments === true);
    const policy = this.options.modelPolicy;
    return { attachments: { supported, kinds: supported ? ['image', 'pdf', 'text'] as Array<'image' | 'pdf' | 'text'> : [], maxCount: 4, maxDecodedBytes: 5 * 1024 * 1024 }, modelPolicy: { effectiveModel: policy?.defaultModel, allowedModels: policy?.allowedModels, modelLocked: !policy?.allowedModels?.length, effectiveTokenBudget: policy?.defaultTokenBudget, maxTokenBudget: policy?.maxTokenBudget, tokenBudgetLocked: !policy?.maxTokenBudget } };
  }

  private resolveModelPolicy(payload: Record<string, unknown> | null): { ok: true; model?: string; tokenBudget?: number } | { ok: false; reason: string } {
    const policy = this.options.modelPolicy;
    const requestedModel = typeof payload?.requestedModel === 'string' ? payload.requestedModel.trim() : '';
    const requestedBudget = typeof payload?.requestedTokenBudget === 'number' ? Math.floor(payload.requestedTokenBudget) : undefined;
    if (requestedModel && (!policy?.allowedModels?.length || !policy.allowedModels.includes(requestedModel))) return { ok: false, reason: 'MODEL_NOT_ALLOWED' };
    if (requestedBudget !== undefined && (!Number.isFinite(requestedBudget) || requestedBudget <= 0 || !policy?.maxTokenBudget || requestedBudget > policy.maxTokenBudget)) return { ok: false, reason: 'TOKEN_BUDGET_NOT_ALLOWED' };
    return { ok: true, model: requestedModel || policy?.defaultModel, tokenBudget: requestedBudget ?? policy?.defaultTokenBudget };
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

function detectAttachmentBytes(bytes: Uint8Array): { kind: 'image' | 'pdf' | 'text'; mimeType: string } | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0xff, 0xd8, 0xff)) return { kind: 'image', mimeType: 'image/jpeg' };
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { kind: 'image', mimeType: 'image/png' };
  if (bytes.length >= 12 && new TextDecoder('ascii').decode(bytes.slice(0, 4)) === 'RIFF'
    && new TextDecoder('ascii').decode(bytes.slice(8, 12)) === 'WEBP') return { kind: 'image', mimeType: 'image/webp' };
  if (new TextDecoder('ascii').decode(bytes.slice(0, 5)) === '%PDF-') return { kind: 'pdf', mimeType: 'application/pdf' };
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!text.includes('\0') && !/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return { kind: 'text', mimeType: 'text/plain' };
  } catch { /* not UTF-8 text */ }
  return null;
}
