// @vitest-environment node
import { once } from 'node:events';
import WebSocket from 'ws';
import { makeEnvelope, type BridgeEnvelope } from '../../lib/bridge-protocol';
import type { AgentEvent, AgentProvider, ToolInvoker } from '../../tools/ai-bridge/src/provider';
import { AiBridgeServer } from '../../tools/ai-bridge/src/server';

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
  it('accepts a token and rejects a missing token', async () => {
    const { port } = await setup(async function* () {});
    const ok = connect(port); expect((await handshake(ok)).type).toBe('session_started');
    ok.close();
    const bad = connect(port); await once(bad, 'open'); send(bad, 'session_start', {});
    expect(await next(bad)).toMatchObject({ type: 'error', payload: { code: 'UNAUTHORIZED' } });
  });

  it('rejects an untrusted Origin during upgrade', async () => {
    const { port } = await setup(async function* () {}); const socket = connect(port, 'https://evil.example');
    const [error] = await once(socket, 'error'); expect(String(error)).toContain('Unexpected server response');
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

  it('resumes a live session with the same sessionId', async () => {
    const { port } = await setup(async function* () {}); const first = connect(port); const started = await handshake(first); first.close(); await once(first, 'close');
    const second = connect(port); const resumed = await handshake(second, String(payload(started).sessionId));
    expect(resumed).toMatchObject({ type: 'session_started', payload: { sessionId: payload(started).sessionId, resumed: true } });
  });
});
