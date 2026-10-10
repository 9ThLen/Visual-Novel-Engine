import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { STATUS_CODES, createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_IMAGE_MESSAGE_BYTES, MAX_MESSAGE_BYTES, SESSION_RESUMED_ELSEWHERE, makeEnvelope, parseEnvelope, type BridgeEnvelope, type BridgeErrorCode, type BridgeProvider, type SessionChallengePayload } from '../../../src/lib/bridge-protocol';
import { AUTHOR_WAIT_TTL_MS, getBridgeTool } from '../../../src/lib/ai/bridge-tools';
import { BridgeToolError, ProviderFailure, type AgentAttachment, type AgentProvider, type AgentProviderFactory, type AgentUserInput } from './provider';
import { BridgeToolRuntime } from './tool-runtime';
import { createImageToolHandlers, describeImageToolCapability, type ImageToolOptions } from './image-tools';
import { normalizeAllowedOrigins } from './origin-policy';
import { getCodexHardeningCapability } from './codex-launch-policy';
import { validateCodexBetaConsent } from '../../../src/lib/ai/codex-beta-consent';
import { parseAiEditorContext } from '../../../src/lib/ai/editor-context';
import { appendEditorContext } from './editor-context-block';
import { startTurnBudget } from './turn-budget';
import { ExternalAgentGate, PROPOSALS_AT_MOST, type EditorSessionView, type ProposalOutcome } from './external-agent-gate';
import { MCP_PATH, createMcpEndpoint } from './mcp-server';

const TURN_TIMEOUT_MS = 120_000;
const TOOL_TIMEOUT_MS = 30_000;
const PATCH_TIMEOUT_MS = 600_000;
const MAX_TOOL_CALLS = 15;
// The app drops a card when its lifetime ends and says so. This is how much
// longer the bridge waits to hear it before giving up on an app that is gone.
const AUTHOR_WAIT_GRACE_MS = 5_000;
// As many as the gate may still owe an agent an answer about. An ending the
// bridge had to settle alone can be corrected by a late answer from the app
// only while the call is remembered here; forgetting it sooner would leave an
// applied change reported as cancelled.
const FINISHED_INTERACTIONS_KEPT = PROPOSALS_AT_MOST;
/** `external` marks a call an agent outside the app made: no turn is waiting on it and none is charged for it. */
type PendingTool = { toolName: string; awaitsAuthor: boolean; external?: boolean; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
/** How a call that waited for the author ended. A status, once set, does not change. */
export type InteractionStatus = 'applied' | 'rejected' | 'expired' | 'cancelled' | 'failed' | 'unknown';
type FinishedInteraction = { status: InteractionStatus; reason?: string; detail?: string; message?: string; settledByBridge?: boolean };
type LiveSession = {
  id: string;
  /** Null on a bridge that runs without chat. */
  provider: AgentProvider | null;
  /** What an external agent has to quote to show it means this editor. A resumed session keeps it. */
  binding: string;
  storyId?: string;
  socket: WebSocket | null;
  generating: boolean;
  interruptReason: 'user' | 'timeout' | null;
  resetting: boolean;
  toolCalls: number;
  turn: Promise<void> | null;
  untrustedAttachmentMode: boolean;
};

export interface BridgeServerOptions {
  port?: number; token?: string; allowedOrigins?: string[]; provider?: BridgeProvider; imageTools?: ImageToolOptions; enableCodexBeta?: boolean; enableClaudeAttachments?: boolean;
  /** Absent on a bridge that runs without chat: sessions start, and nothing answers a message. */
  providerFactory?: AgentProviderFactory;
  /** Turns the MCP endpoint on. Its token is its own, never the pairing token. */
  mcp?: { token: string };
  version?: string;
  logger?: (line: string) => void; toolTimeoutMs?: number; turnTimeoutMs?: number; authorWaitTtlMs?: number; authorWaitGraceMs?: number; modelPolicy?: { defaultModel?: string; allowedModels?: string[]; defaultTokenBudget?: number; maxTokenBudget?: number };
}

export class AiBridgeServer {
  readonly token: string;
  private http: Server | null = null;
  private server: WebSocketServer | null = null;
  private session: LiveSession | null = null;
  private readonly pendingTools = new Map<string, PendingTool>();
  // Kept after the call is over, so a result the app sends twice — it resends
  // until it is acknowledged — is recognised and not taken for a new one.
  private readonly finishedInteractions = new Map<string, FinishedInteraction>();
  private readonly allowedOrigins: Set<string>;
  private readonly log: (line: string) => void;
  private readonly toolRuntime: BridgeToolRuntime;
  /** Both null unless the bridge was started with MCP. */
  private readonly external: ExternalAgentGate | null = null;
  private readonly mcpEndpoint: ((request: IncomingMessage, response: ServerResponse) => Promise<void>) | null = null;

  constructor(private readonly options: BridgeServerOptions) {
    this.token = options.token ?? randomBytes(24).toString('hex');
    this.allowedOrigins = new Set(normalizeAllowedOrigins(options.allowedOrigins));
    this.log = options.logger ?? console.log;
    if (options.mcp) {
      this.external = new ExternalAgentGate({
        ttlMs: options.authorWaitTtlMs,
        editor: {
          session: () => this.sessionForExternalAgent(),
          read: (toolName, input) => this.readForExternalAgent(toolName, input),
          propose: (toolName, input, ttlMs) => this.proposeForExternalAgent(toolName, input, ttlMs),
          withdraw: (proposalId, reason) => this.withdrawAuthorWait(proposalId, reason),
        },
      });
      this.mcpEndpoint = createMcpEndpoint({
        token: options.mcp.token,
        allowedOrigins: this.allowedOrigins,
        gate: this.external,
        log: this.log,
        debug: process.env.AI_BRIDGE_DEBUG === 'true',
        version: options.version,
      });
    }
    this.toolRuntime = new BridgeToolRuntime({
      callApp: (name, input, timeout) => this.callClientTool(name, input, timeout),
      emit: (type, payload) => this.sendCurrent(type, payload),
      logger: this.log,
    });
    this.toolRuntime.setHandlers(createImageToolHandlers({ ...options.imageTools, logger: this.log, debug: process.env.AI_BRIDGE_DEBUG === 'true' }));
  }

  /**
   * One listener for both: the editor's WebSocket, and — when it is on — the
   * MCP endpoint. An agent then needs no second port, and there is one place
   * that is bound to loopback.
   */
  async start(): Promise<number> {
    const http = createServer((request, response) => this.handleHttp(request, response));
    this.http = http;
    this.server = new WebSocketServer({
      server: http, maxPayload: MAX_IMAGE_MESSAGE_BYTES,
      verifyClient: ({ origin }: { origin: string; req: IncomingMessage }) => this.allowedOrigins.has(origin),
    });
    this.server.on('connection', socket => this.handleConnection(socket));
    this.server.on('wsClientError', (_error, socket) => socket.destroy());
    // The WebSocket server passes the listener's errors on; with nobody
    // listening for them there, a port in use would be an uncaught exception.
    this.server.on('error', () => undefined);
    await new Promise<void>((resolve, reject) => {
      http.once('listening', resolve);
      http.once('error', reject);
      http.listen(this.options.port ?? 8787, '127.0.0.1');
    });
    const address = http.address();
    return typeof address === 'object' && address ? address.port : (this.options.port ?? 8787);
  }

  async close(): Promise<void> {
    this.session?.provider?.abort();
    await this.session?.provider?.close?.();
    this.cancelAuthorWaits('BRIDGE_SHUTTING_DOWN');
    for (const pending of this.pendingTools.values()) { clearTimeout(pending.timer); pending.reject(new Error('Bridge shutting down')); }
    this.pendingTools.clear();
    for (const client of this.server?.clients ?? []) client.close(1001, 'Server shutting down');
    if (this.server) await new Promise<void>(resolve => this.server?.close(() => resolve()));
    this.server = null;
    const http = this.http;
    this.http = null;
    if (http) {
      // An agent's client keeps its connection open between calls.
      http.closeAllConnections();
      await new Promise<void>(resolve => http.close(() => resolve()));
    }
  }

  /** Whether this bridge answers chat messages at all. */
  private get chat(): boolean { return this.options.providerFactory !== undefined; }

  private handleHttp(request: IncomingMessage, response: ServerResponse): void {
    const path = (request.url ?? '').split('?')[0];
    if (this.mcpEndpoint && path === MCP_PATH) {
      void this.mcpEndpoint(request, response);
      return;
    }
    // What the WebSocket server answered while the listener was its own.
    const body = STATUS_CODES[426] ?? 'Upgrade Required';
    response.writeHead(426, { 'Content-Length': body.length, 'Content-Type': 'text/plain' });
    response.end(body);
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
    const context = this.record(payload?.context);
    const locale = typeof context?.locale === 'string' ? context.locale : undefined;
    const storyId = typeof context?.storyId === 'string' && context.storyId.length <= 200 ? context.storyId : undefined;
    if (this.session) {
      if (this.session.socket?.readyState === WebSocket.OPEN && resumeId !== this.session.id) {
        this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'Another session is already active', { reason: 'SESSION_ALREADY_ACTIVE' });
        socket.close();
        return false;
      }
      // The id alone does not make it the same session. A tab keeps the id
      // across a reload, and may have another story open by the time it comes
      // back; a session — its binding, its conversation, what was proposed in
      // it — is about one story. Naming a story where none was named, or the
      // other way round, counts as another story: it cannot be shown to be the same.
      if (resumeId === this.session.id && storyId === this.session.storyId) {
        this.session.socket?.close(1000, SESSION_RESUMED_ELSEWHERE);
        this.session.socket = socket;
        this.send(socket, 'session_started', this.sessionStarted(this.session, true), this.session.id);
        this.toolRuntime.reemitBufferedImages();
        return true;
      }
      // Still on the line only if it is the tab's own earlier connection:
      // anybody else was turned away above.
      const previous = this.session.socket;
      this.disposeSession();
      previous?.close(1000, SESSION_RESUMED_ELSEWHERE);
    }
    const id = randomUUID();
    const tools = this.toolRuntime;
    const policy = this.resolveModelPolicy(payload);
    if (!policy.ok) {
      this.sendError(socket, 'VALIDATION_FAILED', 'Requested model or token budget is not allowed', { reason: policy.reason });
      socket.close();
      return false;
    }
    this.session = {
      id,
      provider: this.options.providerFactory?.(tools, { locale, model: policy.model, sessionTokenBudget: policy.tokenBudget }) ?? null,
      binding: randomBytes(12).toString('hex'),
      ...(storyId ? { storyId } : {}),
      socket,
      generating: false,
      interruptReason: null,
      resetting: false,
      toolCalls: 0,
      turn: null,
      untrustedAttachmentMode: false,
    };
    this.send(socket, 'session_started', this.sessionStarted(this.session, false), id);
    return true;
  }

  /** A bridge without chat names no provider: there is none, and the app must not be told it met the wrong one. */
  private sessionStarted(session: LiveSession, resumed: boolean) {
    return {
      sessionId: session.id,
      resumed,
      ...(this.chat ? { provider: this.options.provider ?? 'claude' } : {}),
      capabilities: this.capabilities(),
      untrustedAttachmentMode: session.untrustedAttachmentMode,
    };
  }

  private preflightChallenge(payload: Record<string, unknown> | null): SessionChallengePayload | null {
    // Everything below is about the chat provider. Without chat, whatever
    // provider the app prefers is beside the point.
    if (!this.chat) return null;
    const provider = this.options.provider ?? 'claude';
    const preferredProvider = payload?.preferredProvider;
    if (typeof preferredProvider === 'string' && preferredProvider !== provider) {
      return { provider, reason: 'PROVIDER_MISMATCH', retryable: false };
    }
    if (provider === 'openai' && !process.env.OPENAI_API_KEY?.trim()) {
      return { provider, reason: 'OPENAI_API_KEY_MISSING', retryable: true };
    }
    if (provider === 'gemini' && !process.env.GEMINI_API_KEY?.trim()) {
      return { provider, reason: 'GEMINI_API_KEY_MISSING', retryable: true };
    }
    if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY?.trim()) {
      return { provider, reason: 'ANTHROPIC_API_KEY_MISSING', retryable: true };
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
    if (message.type === 'interrupt') {
      this.session.interruptReason = 'user';
      this.cancelAuthorWaits('INTERRUPTED', 'turn');
      this.session.provider?.abort();
      return;
    }
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
    if (!this.session.provider) {
      return this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'This bridge runs without chat', { reason: 'CHAT_UNSUPPORTED' });
    }
    const decoded = this.decodeUserInput(message.payload);
    if (!decoded.ok) {
      const about = decoded.reason.startsWith('EDITOR_CONTEXT') ? 'editor context' : 'attachment payload';
      return this.sendError(socket, 'VALIDATION_FAILED', `Invalid ${about}`, { reason: decoded.reason });
    }
    if (decoded.input.attachments.length && !this.capabilities().attachments.supported) {
      return this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'Attachments are not supported by this provider', { reason: 'ATTACHMENTS_UNSUPPORTED' });
    }
    // One interaction at a time: a proposal in front of the author holds the
    // session, whether or not the turn that made it is still running.
    if (this.authorWaitPending()) {
      return this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'A proposal is waiting for the author', { reason: 'PROPOSAL_PENDING' });
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
        this.cancelAuthorWaits('CONVERSATION_RESET', 'turn');
        session.provider?.abort();
        await session.turn;
      }
      await session.provider?.resetConversation();
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
    const provider = session.provider!;
    session.generating = true; session.interruptReason = null; session.toolCalls = 0;
    this.toolRuntime.beginTurn();
    // Time the author spends on a proposal is theirs, not the turn's.
    const budget = startTurnBudget(this.options.turnTimeoutMs ?? TURN_TIMEOUT_MS, () => {
      session.interruptReason = 'timeout';
      provider.abort();
    }, this.toolRuntime);
    try {
      for await (const event of provider.send(input)) {
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
      budget.stop();
      // A card must not outlive the turn that put it up: its answer would
      // start work nobody is waiting for.
      if (this.session === session) this.cancelAuthorWaits('TURN_ENDED', 'turn');
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
    // Checked again here whatever the app did: the limits protect the model's
    // context, and a turn must not start on a context nobody validated.
    if (value?.editorContext === undefined || value.editorContext === null) return { ok: true, input: { text, attachments } };
    const context = parseAiEditorContext(value.editorContext);
    if (!context.ok) {
      return { ok: false, reason: context.reason === 'TOO_LARGE' ? 'EDITOR_CONTEXT_TOO_LARGE' : 'EDITOR_CONTEXT_INVALID' };
    }
    return { ok: true, input: { text: appendEditorContext(text, context.context), attachments } };
  }

  private callClientTool(toolName: string, input: unknown, timeoutMs?: number): Promise<unknown> {
    const session = this.session;
    if (!session?.socket) return Promise.reject(new Error('App disconnected'));
    session.toolCalls += 1;
    if (session.toolCalls > MAX_TOOL_CALLS) {
      session.provider?.abort();
      this.sendCurrent('assistant_done', { stopReason: 'tool_limit' });
      this.sendCurrent('error', {
        code: 'PROVIDER_UNAVAILABLE',
        message: `Tool call limit (${MAX_TOOL_CALLS}) exceeded`,
        details: { reason: 'TOOL_LIMIT_EXCEEDED' },
      });
      return Promise.reject(new Error('Tool call limit exceeded'));
    }
    const toolCallId = randomUUID();
    if (getBridgeTool(toolName)?.awaitsAuthor) return this.callForAuthor(toolCallId, toolName, input, session);
    this.sendCurrent('tool_call', { toolCallId, toolName, input, untrustedAttachmentMode: session.untrustedAttachmentMode });
    const timeout = timeoutMs ?? (toolName === 'propose_scene_patch' ? PATCH_TIMEOUT_MS : (this.options.toolTimeoutMs ?? TOOL_TIMEOUT_MS));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingTools.delete(toolCallId); reject(new Error(`Tool ${toolName} timed out`)); }, timeout);
      this.pendingTools.set(toolCallId, { toolName, awaitsAuthor: false, resolve, reject, timer });
    });
  }

  /**
   * A call that shows the author a card. The app owns its lifetime: it drops
   * the card when `ttlMs` is up and answers `expired`. The timer here only
   * covers an app that never answers — then nobody knows whether the change
   * was applied, and that is what the model is told.
   */
  private callForAuthor(toolCallId: string, toolName: string, input: unknown, session: LiveSession): Promise<unknown> {
    const ttlMs = this.options.authorWaitTtlMs ?? AUTHOR_WAIT_TTL_MS;
    this.sendCurrent('tool_call', { toolCallId, toolName, input, untrustedAttachmentMode: session.untrustedAttachmentMode, origin: 'chat', ttlMs });
    this.toolRuntime.authorWait.begin();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.sendCurrent('tool_cancel', { toolCallId, reason: 'EXPIRED' });
        this.finishAuthorWait(toolCallId, { status: 'unknown', settledByBridge: true })?.reject(new BridgeToolError(
          'PROVIDER_UNAVAILABLE',
          'The app did not answer before the proposal expired, so whether it was applied is unknown. Read the current state again before proposing anything else.',
          { status: 'unknown' },
        ));
      }, ttlMs + (this.options.authorWaitGraceMs ?? AUTHOR_WAIT_GRACE_MS));
      this.pendingTools.set(toolCallId, { toolName, awaitsAuthor: true, resolve, reject, timer });
    });
  }

  /** Takes a waiting call out of play under its final status; null if it was already over. */
  private finishAuthorWait(toolCallId: string, outcome: FinishedInteraction): PendingTool | null {
    const pending = this.pendingTools.get(toolCallId);
    if (!pending) return null;
    clearTimeout(pending.timer);
    this.pendingTools.delete(toolCallId);
    this.finishedInteractions.set(toolCallId, outcome);
    for (const id of this.finishedInteractions.keys()) {
      if (this.finishedInteractions.size <= FINISHED_INTERACTIONS_KEPT) break;
      this.finishedInteractions.delete(id);
    }
    // Only a turn has a clock to stop, and an external agent has none.
    if (pending.external) this.external?.settle(toolCallId, proposalOutcome(outcome));
    else this.toolRuntime.authorWait.end();
    return pending;
  }

  private authorWaitPending(): boolean {
    for (const pending of this.pendingTools.values()) if (pending.awaitsAuthor) return true;
    return false;
  }

  /**
   * Withdraws the cards that are still up: the app removes each, and the call
   * that put it up fails. `turn` leaves an external agent's proposal alone —
   * it belongs to no turn, so a turn ending or being stopped is not its end.
   */
  private cancelAuthorWaits(reason: string, scope: 'all' | 'turn' = 'all'): void {
    for (const [toolCallId, pending] of [...this.pendingTools]) {
      if (!pending.awaitsAuthor || (scope === 'turn' && pending.external)) continue;
      this.withdrawAuthorWait(toolCallId, reason);
    }
  }

  private withdrawAuthorWait(toolCallId: string, reason: string): void {
    if (!this.pendingTools.get(toolCallId)?.awaitsAuthor) return;
    this.sendCurrent('tool_cancel', { toolCallId, reason });
    this.finishAuthorWait(toolCallId, { status: 'cancelled', reason, settledByBridge: true })?.reject(new BridgeToolError(
      'PROVIDER_UNAVAILABLE',
      'The proposal was withdrawn before the author decided on it.',
      { status: 'cancelled', reason },
    ));
  }

  private sessionForExternalAgent(): EditorSessionView | null {
    const session = this.session;
    if (!session) return null;
    return {
      binding: session.binding,
      ...(session.storyId ? { storyId: session.storyId } : {}),
      connected: session.socket?.readyState === WebSocket.OPEN,
      chatTurnRunning: session.generating,
      interactionPending: this.authorWaitPending(),
    };
  }

  /**
   * A read for an agent outside the app. It is stamped as external and as
   * untrusted: the app then asks the author about anything such a call would
   * change, whatever the author allowed the built-in chat to do on its own.
   * It is not counted against a turn, and it stops no turn.
   */
  private readForExternalAgent(toolName: string, input: unknown): Promise<unknown> {
    if (!this.session?.socket) {
      return Promise.reject(new BridgeToolError('PROVIDER_UNAVAILABLE', 'No editor is connected to the bridge', { reason: 'EDITOR_NOT_CONNECTED' }));
    }
    const toolCallId = randomUUID();
    this.sendCurrent('tool_call', { toolCallId, toolName, input, untrustedAttachmentMode: true, origin: 'external' });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTools.delete(toolCallId);
        reject(new BridgeToolError('PROVIDER_UNAVAILABLE', `The editor did not answer ${toolName} in time`, { reason: 'EDITOR_TIMEOUT' }));
      }, this.options.toolTimeoutMs ?? TOOL_TIMEOUT_MS);
      this.pendingTools.set(toolCallId, { toolName, awaitsAuthor: false, external: true, resolve, reject, timer });
    });
  }

  /**
   * A proposal from an agent outside the app. It is in the table of waiting
   * calls before this returns, so a chat message that arrives a moment later —
   * before the app has even shown the card — already finds the session taken.
   */
  private proposeForExternalAgent(toolName: string, input: unknown, ttlMs: number): string {
    const toolCallId = randomUUID();
    this.sendCurrent('tool_call', { toolCallId, toolName, input, untrustedAttachmentMode: true, origin: 'external', ttlMs });
    const timer = setTimeout(() => {
      this.sendCurrent('tool_cancel', { toolCallId, reason: 'EXPIRED' });
      this.finishAuthorWait(toolCallId, { status: 'unknown', settledByBridge: true });
    }, ttlMs + (this.options.authorWaitGraceMs ?? AUTHOR_WAIT_GRACE_MS));
    // Nobody awaits it: the agent's call has already been answered `pending`.
    this.pendingTools.set(toolCallId, { toolName, awaitsAuthor: true, external: true, resolve: () => undefined, reject: () => undefined, timer });
    return toolCallId;
  }

  /** The status of a call that waited for the author; undefined while it waits or if it never did. */
  interactionStatus(toolCallId: string): { status: InteractionStatus; reason?: string } | undefined {
    const finished = this.finishedInteractions.get(toolCallId);
    if (!finished) return undefined;
    return { status: finished.status, ...(finished.reason ? { reason: finished.reason } : {}) };
  }

  private resolveTool(payload: unknown): void {
    const value = this.record(payload); const id = value?.toolCallId;
    if (typeof id !== 'string') return;
    const pending = this.pendingTools.get(id);
    if (!pending) {
      // Sent again because the first copy was never acknowledged, or sent after
      // the bridge gave the call up. Saying "received" lets the app stop
      // resending. A status the app decided stands. One the bridge had to
      // settle without the app gives way to what the app reports: `unknown` to
      // anything, and a withdrawal or an expiry to a change that had already
      // been written when it crossed them — the app writes nothing after either.
      const finished = this.finishedInteractions.get(id);
      if (!finished) return;
      const reported = interactionOutcome(value);
      if (finished.status === 'unknown' || (reported.status === 'applied' && finished.settledByBridge)) {
        this.finishedInteractions.set(id, reported);
        // Ignored unless the call was an external agent's proposal.
        this.external?.settle(id, proposalOutcome(reported));
      }
      this.sendCurrent('tool_result_ack', { toolCallId: id });
      return;
    }
    if (pending.awaitsAuthor) {
      this.finishAuthorWait(id, interactionOutcome(value));
      this.sendCurrent('tool_result_ack', { toolCallId: id });
    } else {
      clearTimeout(pending.timer); this.pendingTools.delete(id);
    }
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
    const supported = this.chat && (this.options.provider === 'openai' || this.options.provider === 'gemini'
      || this.options.provider === 'anthropic'
      || (this.options.provider === 'claude' && this.options.enableClaudeAttachments === true));
    const policy = this.options.modelPolicy;
    return {
      chat: { supported: this.chat },
      ...(this.external ? { externalAgent: { enabled: true } } : {}),
      attachments: { supported, kinds: supported ? ['image', 'pdf', 'text'] as ('image' | 'pdf' | 'text')[] : [], maxCount: 4, maxDecodedBytes: 5 * 1024 * 1024 },
      imageGeneration: describeImageToolCapability(this.options.imageTools),
      modelPolicy: { effectiveModel: policy?.defaultModel, allowedModels: policy?.allowedModels, modelLocked: !policy?.allowedModels?.length, effectiveTokenBudget: policy?.defaultTokenBudget, maxTokenBudget: policy?.maxTokenBudget, tokenBudgetLocked: !policy?.maxTokenBudget },
    };
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
    this.cancelAuthorWaits('SESSION_ENDED');
    session.provider?.abort();
    void session.provider?.close?.();
    for (const pending of this.pendingTools.values()) {
      clearTimeout(pending.timer);
      pending.reject(pending.external
        ? new BridgeToolError('PROVIDER_UNAVAILABLE', 'The editor closed before answering', { reason: 'EDITOR_NOT_CONNECTED' })
        : new Error('Session ended'));
    }
    this.pendingTools.clear();
    this.finishedInteractions.clear();
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
    if (process.env.GEMINI_API_KEY) message = message.replaceAll(process.env.GEMINI_API_KEY, '[REDACTED]');
    return message.replace(/(?:sk-(?:ant-)?|AIza[\w-]+|(?:ANTHROPIC|OPENAI|GEMINI)_API_KEY\s*[=:]\s*)\S+/gi, '[REDACTED]');
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

/**
 * Reads the status off what the app answered. The chat's models go on getting
 * the answer itself, `{accepted, reason}`; the status is the same fact in the
 * words an outside agent is told it in.
 */
function interactionOutcome(result: Record<string, unknown> | null): FinishedInteraction {
  if (result?.ok !== true) {
    const details = typeof result?.details === 'object' && result.details !== null ? result.details as Record<string, unknown> : {};
    return {
      status: 'failed',
      reason: typeof result?.errorCode === 'string' ? result.errorCode : 'VALIDATION_FAILED',
      ...(typeof details.reason === 'string' ? { detail: details.reason } : {}),
      ...(typeof result?.errorMessage === 'string' ? { message: result.errorMessage.slice(0, 2000) } : {}),
    };
  }
  const answer = typeof result.result === 'object' && result.result !== null ? result.result as Record<string, unknown> : {};
  if (answer.accepted === true || answer.allowed === true) return { status: 'applied' };
  const reason = typeof answer.reason === 'string' ? answer.reason : undefined;
  if (reason === 'expired' || reason === 'cancelled' || reason === 'unknown') return { status: reason };
  return { status: 'rejected', ...(reason ? { reason } : {}) };
}

/** The same outcome, without the bridge's own bookkeeping, for the agent that made the proposal. */
function proposalOutcome(outcome: FinishedInteraction): ProposalOutcome {
  return {
    status: outcome.status,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(outcome.detail ? { detail: outcome.detail } : {}),
    ...(outcome.message ? { message: outcome.message } : {}),
  };
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
