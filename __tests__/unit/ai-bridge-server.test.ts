// @vitest-environment node
import { once } from 'node:events';
import WebSocket from 'ws';
import { makeEnvelope, type BridgeEnvelope } from '../../lib/bridge-protocol';
import { BridgeToolError, modelToolErrorValue, type AgentEvent, type AgentProvider, type ToolInvoker } from '../../tools/ai-bridge/src/provider';
import { AiBridgeServer } from '../../tools/ai-bridge/src/server';
import { BRIDGE_TOOLS } from '../../lib/ai/bridge-tools';
import { z } from 'zod';

class FakeProvider implements AgentProvider {
  aborted = false;
  constructor(readonly tools: ToolInvoker, private readonly behavior: (self: FakeProvider, text: string) => AsyncIterable<AgentEvent>) {}
  send(text: string) { return this.behavior(this, text); }
  abort() { this.aborted = true; }
}

const servers: AiBridgeServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });

async function setup(behavior: (provider: FakeProvider, text: string) => AsyncIterable<AgentEvent>, toolTimeoutMs = 30) {
  let provider!: FakeProvider;
  const server = new AiBridgeServer({ port: 0, token: 'test-token', toolTimeoutMs, logger: vi.fn(), providerFactory: tools => provider = new FakeProvider(tools, behavior) });
  servers.push(server); const port = await server.start();
  return { server, port, get provider() { return provider; } };
}
function connect(port: number, origin = 'http://localhost:8081') { return new WebSocket(`ws://127.0.0.1:${port}`, { origin }); }
function send(socket: WebSocket, type: Parameters<typeof makeEnvelope>[0], payload: unknown, sessionId = '') { socket.send(JSON.stringify(makeEnvelope(type, payload, sessionId))); }
function next(socket: WebSocket): Promise<BridgeEnvelope> { return new Promise(resolve => socket.once('message', data => resolve(JSON.parse(data.toString())))); }
async function handshake(socket: WebSocket, resumeSessionId?: string) { await once(socket, 'open'); send(socket, 'session_start', resumeSessionId ? { token: 'test-token', resumeSessionId } : { token: 'test-token' }); return next(socket); }
const payload = (message: BridgeEnvelope) => message.payload as Record<string, unknown>;

describe('AI bridge protocol server', () => {
  it('passes the optional app locale to the provider factory', async () => {
    let locale: string | undefined;
    const server = new AiBridgeServer({ port: 0, token: 'test-token', logger: vi.fn(), providerFactory: (_tools, session) => {
      locale = session?.locale;
      return new FakeProvider(_tools, async function* () {});
    } });
    servers.push(server);
    const port = await server.start();
    const socket = connect(port);
    await once(socket, 'open');
    send(socket, 'session_start', { token: 'test-token', context: { locale: 'uk' } });
    await next(socket);
    expect(locale).toBe('uk');
    socket.close();
  });

  it('accepts a token and rejects a missing token', async () => {
    const { port } = await setup(async function* () {});
    const ok = connect(port); expect(await handshake(ok)).toMatchObject({ type: 'session_started', payload: { provider: 'claude' } });
    ok.close();
    const bad = connect(port); await once(bad, 'open'); send(bad, 'session_start', {});
    expect(await next(bad)).toMatchObject({ type: 'error', payload: { code: 'UNAUTHORIZED' } });
  });

  it('rejects an untrusted Origin during upgrade', async () => {
    const { port } = await setup(async function* () {}); const socket = connect(port, 'https://evil.example');
    const [error] = await once(socket, 'error'); expect(String(error)).toContain('Unexpected server response');
  });

  it('lets explicit allowed origins replace the defaults', async () => {
    const server = new AiBridgeServer({
      port: 0,
      token: 'test-token',
      allowedOrigins: ['http://localhost:8092'],
      logger: vi.fn(),
      providerFactory: tools => new FakeProvider(tools, async function* () {}),
    });
    servers.push(server);
    const port = await server.start();
    const defaultOrigin = connect(port);
    const [error] = await once(defaultOrigin, 'error');
    expect(String(error)).toContain('Unexpected server response');
    const explicitOrigin = connect(port, 'http://localhost:8092');
    expect(await handshake(explicitOrigin)).toMatchObject({ type: 'session_started' });
  });

  it('rejects non-loopback configured origins', () => {
    expect(() => new AiBridgeServer({
      port: 0,
      allowedOrigins: ['https://example.com'],
      providerFactory: tools => new FakeProvider(tools, async function* () {}),
    })).toThrow(/loopback http\/https origin/);
  });

  it('correlates tool results and reports a tool timeout to the provider', async () => {
    let observed: unknown; let timeoutMessage = '';
    const { port } = await setup(async function* (provider) {
      observed = await provider.tools.call('get_scene', { sceneId: 's1' });
      try { await provider.tools.call('list_scenes', {}); } catch (error) { timeoutMessage = String(error); }
      yield { type: 'done' };
    });
    const socket = connect(port); const started = await handshake(socket); send(socket, 'user_message', { text: 'go' }, String(payload(started).sessionId));
    const call = await next(socket); send(socket, 'tool_result', { toolCallId: payload(call).toolCallId, ok: true, result: { id: 's1' } }, String(payload(started).sessionId));
    expect((await next(socket)).type).toBe('tool_call');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(observed).toEqual({ id: 's1' }); expect(timeoutMessage).toContain('timed out');
  });

  it('interrupt aborts streaming and emits interrupted completion', async () => {
    const context = await setup(async function* (self) { while (!self.aborted) { await new Promise(resolve => setTimeout(resolve, 5)); yield { type: 'text', text: 'x' }; } });
    const socket = connect(context.port); const started = await handshake(socket); send(socket, 'user_message', { text: 'go' }, String(payload(started).sessionId));
    await next(socket); send(socket, 'interrupt', {}, String(payload(started).sessionId));
    expect(await next(socket)).toMatchObject({ type: 'assistant_done', payload: { stopReason: 'interrupted' } }); expect(context.provider.aborted).toBe(true);
  });

  it('reports a concurrent turn with a structured reason', async () => {
    const context = await setup(async function* (self) {
      while (!self.aborted) {
        await new Promise(resolve => setTimeout(resolve, 5));
        yield { type: 'text', text: 'x' };
      }
    });
    const socket = connect(context.port);
    const started = await handshake(socket);
    const sessionId = String(payload(started).sessionId);
    send(socket, 'user_message', { text: 'first' }, sessionId);
    await next(socket);
    send(socket, 'user_message', { text: 'second' }, sessionId);
    expect(await next(socket)).toMatchObject({
      type: 'error',
      payload: {
        code: 'PROVIDER_UNAVAILABLE',
        details: { reason: 'TURN_ALREADY_RUNNING' },
      },
    });
    send(socket, 'interrupt', {}, sessionId);
  });

  it('resumes a live session with the same sessionId', async () => {
    const { port } = await setup(async function* () {}); const first = connect(port); const started = await handshake(first); first.close(); await once(first, 'close');
    const second = connect(port); const resumed = await handshake(second, String(payload(started).sessionId));
    expect(resumed).toMatchObject({ type: 'session_started', payload: { sessionId: payload(started).sessionId, resumed: true } });
  });

  it('replaces a dead session immediately but refuses active takeover', async () => {
    const { port } = await setup(async function* () {});
    const first = connect(port); await handshake(first);
    const active = connect(port);
    expect(await handshake(active)).toMatchObject({
      type: 'error',
      payload: {
        code: 'PROVIDER_UNAVAILABLE',
        details: { reason: 'SESSION_ALREADY_ACTIVE' },
      },
    });
    first.terminate(); await once(first, 'close');
    const replacement = connect(port); expect(await handshake(replacement)).toMatchObject({ type: 'session_started', payload: { resumed: false } });
  });

  it('disposes a session on session_end', async () => {
    const { port } = await setup(async function* () {});
    const first = connect(port); const started = await handshake(first);
    send(first, 'session_end', {}, String(payload(started).sessionId));
    await new Promise(resolve => setTimeout(resolve, 5));
    const nextClient = connect(port); expect(await handshake(nextClient)).toMatchObject({ type: 'session_started', payload: { resumed: false } });
  });

  it('preserves structured tool errors for provider-visible results', async () => {
    let observed: unknown;
    const { port } = await setup(async function* (provider) {
      try { await provider.tools.call('get_scene', {}); } catch (error) { observed = modelToolErrorValue(error); }
      yield { type: 'done' };
    });
    const socket = connect(port); const started = await handshake(socket); send(socket, 'user_message', { text: 'go' }, String(payload(started).sessionId));
    const call = await next(socket);
    send(socket, 'tool_result', { toolCallId: payload(call).toolCallId, ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Blocked', details: { reason: 'USER_BLOCKED' } }, String(payload(started).sessionId));
    await next(socket);
    expect(observed).toEqual({ errorCode: 'PERMISSION_DENIED', errorMessage: 'Blocked', details: { reason: 'USER_BLOCKED' } });
    expect(new BridgeToolError('PERMISSION_DENIED', 'Blocked')).toBeInstanceOf(Error);
  });

  it('authorizes oversized binary results by pending toolCallId, not envelope requestId', async () => {
    BRIDGE_TOOLS.push({ name: 'test_binary', description: 'Test binary result.', inputSchema: z.object({}), exposure: 'internal', site: 'app', binaryResult: true });
    try {
      let observed = '';
      const { port } = await setup(async function* (provider) { observed = String(await provider.tools.call('test_binary', {})); yield { type: 'done' }; }, 1_000);
      const socket = connect(port); const started = await handshake(socket); send(socket, 'user_message', { text: 'go' }, String(payload(started).sessionId));
      const call = await next(socket);
      send(socket, 'tool_result', { toolCallId: payload(call).toolCallId, ok: true, binaryTool: true, result: 'x'.repeat(1_100_000) }, String(payload(started).sessionId));
      await next(socket);
      expect(observed).toHaveLength(1_100_000);
    } finally {
      BRIDGE_TOOLS.splice(BRIDGE_TOOLS.findIndex(tool => tool.name === 'test_binary'), 1);
    }
  });

  it('rejects an oversized result for an unknown or non-binary pending tool', async () => {
    const { port } = await setup(async function* (provider) { await provider.tools.call('get_scene', {}); yield { type: 'done' }; }, 1_000);
    const socket = connect(port); const started = await handshake(socket); send(socket, 'user_message', { text: 'go' }, String(payload(started).sessionId));
    const call = await next(socket);
    send(socket, 'tool_result', { toolCallId: payload(call).toolCallId, ok: true, binaryTool: true, result: 'x'.repeat(1_100_000) }, String(payload(started).sessionId));
    expect(await next(socket)).toMatchObject({ type: 'error', payload: { code: 'PROTOCOL_ERROR' } });
  });

  it('returns a readable structured result to the model when image generation is not configured', async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      let observed: unknown;
      const { port } = await setup(async function* (provider) {
        try { await provider.tools.call('generate_image', { prompt: 'forest', purpose: 'background' }); }
        catch (error) { observed = modelToolErrorValue(error); }
        yield { type: 'done' };
      });
      const socket = connect(port); const started = await handshake(socket);
      send(socket, 'user_message', { text: 'generate' }, String(payload(started).sessionId));
      await next(socket);
      expect(observed).toMatchObject({
        errorCode: 'PROVIDER_UNAVAILABLE',
        errorMessage: expect.stringContaining('OPENAI_API_KEY'),
        details: { reason: 'IMAGE_PROVIDER_NOT_CONFIGURED' },
      });
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
    }
  });

  it('re-emits an unacked image on resume with the same id and clears it on ack', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-image-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'YWJj' }] }) })));
    try {
      const { server, port } = await setup(async function* (provider) {
        await provider.tools.call('generate_image', { prompt: 'forest', purpose: 'background' });
        yield { type: 'done' };
      }, 1_000);
      const socket = connect(port); const started = await handshake(socket); const sessionId = String(payload(started).sessionId);
      send(socket, 'user_message', { text: 'generate' }, sessionId);
      const authorization = await next(socket);
      expect(authorization).toMatchObject({ type: 'tool_call', payload: { toolName: 'authorize_capability' } });
      send(socket, 'tool_result', { toolCallId: payload(authorization).toolCallId, ok: true, result: { allowed: true } }, sessionId);
      const result = await next(socket);
      expect(result.type).toBe('image_result');
      const requestId = String(payload(result).requestId);
      const closed = once(socket, 'close'); socket.close(); await closed;

      const resumed = connect(port); await once(resumed, 'open');
      const firstTwo = new Promise<BridgeEnvelope[]>(resolve => {
        const messages: BridgeEnvelope[] = [];
        resumed.on('message', data => { messages.push(JSON.parse(data.toString())); if (messages.length === 2) resolve(messages); });
      });
      send(resumed, 'session_start', { token: 'test-token', resumeSessionId: sessionId });
      const [resumedStarted, replay] = await firstTwo;
      expect(resumedStarted).toMatchObject({ type: 'session_started', payload: { resumed: true } });
      expect(replay).toMatchObject({ type: 'image_result', payload: { requestId } });
      send(resumed, 'image_result_ack', { requestId }, sessionId);
      await new Promise(resolve => setTimeout(resolve, 5));
      const runtime = (server as unknown as { toolRuntime: { bufferedImageCount: number } }).toolRuntime;
      expect(runtime.bufferedImageCount).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
    }
  });
});
