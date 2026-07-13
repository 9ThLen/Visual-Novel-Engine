import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_MESSAGE_BYTES, makeEnvelope, parseEnvelope, type BridgeEnvelope, type BridgeErrorCode } from '../../../lib/bridge-protocol';
import type { AgentProvider, AgentProviderFactory, ToolInvoker } from './provider';

const TURN_TIMEOUT_MS = 120_000;
const TOOL_TIMEOUT_MS = 30_000;
const PATCH_TIMEOUT_MS = 600_000;
const MAX_TOOL_CALLS = 15;
const DEFAULT_ORIGINS = ['http://localhost:8081', 'http://127.0.0.1:8081'];

type PendingTool = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
type LiveSession = { id: string; provider: AgentProvider; socket: WebSocket | null; generating: boolean; interrupted: boolean; toolCalls: number };

export interface BridgeServerOptions { port?: number; token?: string; allowedOrigins?: string[]; providerFactory: AgentProviderFactory; logger?: (line: string) => void; toolTimeoutMs?: number }

export class AiBridgeServer {
  readonly token: string;
  private server: WebSocketServer | null = null;
  private session: LiveSession | null = null;
  private readonly pendingTools = new Map<string, PendingTool>();
  private readonly allowedOrigins: Set<string>;
  private readonly log: (line: string) => void;

  constructor(private readonly options: BridgeServerOptions) {
    this.token = options.token ?? randomBytes(24).toString('hex');
    this.allowedOrigins = new Set([...DEFAULT_ORIGINS, ...(options.allowedOrigins ?? [])]);
    this.log = options.logger ?? console.log;
  }

  async start(): Promise<number> {
    this.server = new WebSocketServer({
      host: '127.0.0.1', port: this.options.port ?? 8787, maxPayload: MAX_MESSAGE_BYTES,
      verifyClient: ({ origin }: { origin: string; req: IncomingMessage }) => this.allowedOrigins.has(origin),
    });
    this.server.on('connection', socket => this.handleConnection(socket));
    this.server.on('wsClientError', (_error, socket) => socket.destroy());
    await new Promise<void>((resolve, reject) => { this.server?.once('listening', resolve); this.server?.once('error', reject); });
    const address = this.server.address();
    const port = typeof address === 'object' && address ? address.port : (this.options.port ?? 8787);
    this.log(`AI Bridge: EXPO_PUBLIC_AI_BRIDGE_TOKEN=${this.token}`);
    this.log(`AI Bridge listening on ws://127.0.0.1:${port}`);
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
      if (isBinary || new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return this.protocolClose(socket, 'Message exceeds 1MB');
      const parsed = parseEnvelope(raw);
      if ('parseError' in parsed) return this.protocolClose(socket, parsed.parseError);
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
    const resumeId = typeof payload?.resumeSessionId === 'string' ? payload.resumeSessionId : undefined;
    if (this.session) {
      if (resumeId !== this.session.id) { this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'Another session is already active'); socket.close(); return false; }
      this.session.socket?.close(1000, 'Session resumed elsewhere');
      this.session.socket = socket;
      this.send(socket, 'session_started', { sessionId: this.session.id, resumed: true }, this.session.id);
      return true;
    }
    const id = randomUUID();
    const tools: ToolInvoker = { call: (name, input, timeout) => this.callClientTool(name, input, timeout) };
    this.session = { id, provider: this.options.providerFactory(tools), socket, generating: false, interrupted: false, toolCalls: 0 };
    this.send(socket, 'session_started', { sessionId: id, resumed: false }, id);
    return true;
  }

  private handleMessage(socket: WebSocket, message: BridgeEnvelope): void {
    if (!this.session || socket !== this.session.socket || (message.sessionId && message.sessionId !== this.session.id)) return this.protocolClose(socket, 'Invalid session');
    if (message.type === 'ping') return this.send(socket, 'pong', {}, this.session.id);
    if (message.type === 'interrupt') { this.session.interrupted = true; this.session.provider.abort(); return; }
    if (message.type === 'tool_result') return this.resolveTool(message.payload);
    if (message.type !== 'user_message') return this.protocolClose(socket, 'Unexpected client message');
    const text = this.record(message.payload)?.text;
    if (typeof text !== 'string' || !text.trim()) return this.protocolClose(socket, 'user_message.text must be a non-empty string');
    if (this.session.generating) return this.sendError(socket, 'PROVIDER_UNAVAILABLE', 'A turn is already running');
    void this.runTurn(text);
  }

  private async runTurn(text: string): Promise<void> {
    const session = this.session!;
    session.generating = true; session.interrupted = false; session.toolCalls = 0;
    const timer = setTimeout(() => { session.interrupted = true; session.provider.abort(); }, TURN_TIMEOUT_MS);
    try {
      for await (const event of session.provider.send(text)) {
        if (session.interrupted) break;
        if (event.type === 'text') this.sendCurrent('assistant_delta', { text: event.text });
        if (event.type === 'done') this.sendCurrent('assistant_done', { stopReason: event.stopReason ?? 'end_turn' });
      }
      if (session.interrupted) this.sendCurrent('assistant_done', { stopReason: 'interrupted' });
    } catch (error) {
      if (session.interrupted) this.sendCurrent('assistant_done', { stopReason: 'interrupted' });
      else this.sendCurrent('error', { code: 'PROVIDER_UNAVAILABLE', message: this.safeError(error) });
    } finally { clearTimeout(timer); session.generating = false; }
  }

  private callClientTool(toolName: string, input: unknown, timeoutMs?: number): Promise<unknown> {
    const session = this.session;
    if (!session?.socket) return Promise.reject(new Error('App disconnected'));
    session.toolCalls += 1;
    if (session.toolCalls > MAX_TOOL_CALLS) { session.provider.abort(); this.sendCurrent('assistant_done', { stopReason: 'tool_limit' }); this.sendCurrent('error', { code: 'PROVIDER_UNAVAILABLE', message: `Tool call limit (${MAX_TOOL_CALLS}) exceeded` }); return Promise.reject(new Error('Tool call limit exceeded')); }
    const toolCallId = randomUUID();
    this.sendCurrent('tool_call', { toolCallId, toolName, input });
    const timeout = timeoutMs ?? (toolName === 'propose_scene_patch' ? PATCH_TIMEOUT_MS : (this.options.toolTimeoutMs ?? TOOL_TIMEOUT_MS));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingTools.delete(toolCallId); reject(new Error(`Tool ${toolName} timed out`)); }, timeout);
      this.pendingTools.set(toolCallId, { resolve, reject, timer });
    });
  }

  private resolveTool(payload: unknown): void {
    const value = this.record(payload); const id = value?.toolCallId;
    if (typeof id !== 'string') return;
    const pending = this.pendingTools.get(id); if (!pending) return;
    clearTimeout(pending.timer); this.pendingTools.delete(id);
    if (value?.ok === true) pending.resolve(value.result);
    else pending.reject(new Error(typeof value?.errorMessage === 'string' ? value.errorMessage : 'Tool failed'));
  }

  private validToken(payload: unknown): boolean {
    const candidate = this.record(payload)?.token;
    if (typeof candidate !== 'string') return false;
    const encoder = new TextEncoder(); const a = encoder.encode(candidate); const b = encoder.encode(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  private record(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null; }
  private safeError(error: unknown): string { return (error instanceof Error ? error.message : 'Provider failed').replaceAll(this.token, '[REDACTED]').replace(/(?:sk-ant-|ANTHROPIC_API_KEY\s*[=:]\s*)\S+/gi, '[REDACTED]'); }
  private sendCurrent(type: Parameters<typeof makeEnvelope>[0], payload: unknown): void { if (this.session?.socket) this.send(this.session.socket, type, payload, this.session.id); }
  private send(socket: WebSocket, type: Parameters<typeof makeEnvelope>[0], payload: unknown, id = ''): void { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(makeEnvelope(type, payload, id))); }
  private sendError(socket: WebSocket, code: BridgeErrorCode, message: string): void { this.send(socket, 'error', { code, message }, this.session?.id ?? ''); }
  private errorAndClose(socket: WebSocket, code: BridgeErrorCode, message: string): void { this.sendError(socket, code, message); socket.close(1008, message); }
  private protocolClose(socket: WebSocket, message: string): void { this.errorAndClose(socket, 'PROTOCOL_ERROR', message); }
}
