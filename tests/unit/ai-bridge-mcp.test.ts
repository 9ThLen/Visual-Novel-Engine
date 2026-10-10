// @vitest-environment node
/**
 * The bridge's MCP endpoint, driven the way an agent drives it: the SDK's own
 * client over HTTP, against the real server, with a stand-in for the tab that
 * holds the story.
 */
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BRIDGE_TOOLS, EXTERNAL_BRIDGE_TOOLS } from '../../src/lib/ai/bridge-tools';
import { makeEnvelope, type BridgeEnvelope } from '../../src/lib/bridge-protocol';
import { EXTERNAL_CALLS_PER_MINUTE, ExternalAgentGate, PROPOSALS_AT_MOST, PROPOSAL_KEPT_MS, type EditorPort, type EditorSessionView } from '../../tools/ai-bridge/src/external-agent-gate';
import { SESSION_RESUMED_ELSEWHERE } from '../../src/lib/bridge-protocol';
import { modelToolErrorValue, type AgentEvent, type AgentProvider, type ToolInvoker } from '../../tools/ai-bridge/src/provider';
import { AiBridgeServer, type BridgeServerOptions } from '../../tools/ai-bridge/src/server';

const MCP_TOKEN = 'mcp-test-token';
const PAIRING_TOKEN = 'pairing-test-token';

class FakeProvider implements AgentProvider {
  aborted = false;
  sent = 0;
  constructor(readonly tools: ToolInvoker, private readonly behavior: (self: FakeProvider) => AsyncIterable<AgentEvent>) {}
  send() { this.sent += 1; return this.behavior(this); }
  abort() { this.aborted = true; }
  resetConversation() {}
}

const servers: AiBridgeServer[] = [];
const sockets: WebSocket[] = [];
const agents: Client[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map(agent => agent.close().catch(() => undefined)));
  sockets.splice(0).forEach(socket => socket.terminate());
  await Promise.all(servers.splice(0).map(server => server.close()));
});

const quietTurn = async function* (): AsyncIterable<AgentEvent> { yield { type: 'done' }; };

async function startBridge(options: Partial<BridgeServerOptions> = {}) {
  const providers: FakeProvider[] = [];
  const logger = vi.fn<(line: string) => void>();
  const server = new AiBridgeServer({
    port: 0,
    token: PAIRING_TOKEN,
    logger,
    mcp: { token: MCP_TOKEN },
    providerFactory: (tools) => { const provider = new FakeProvider(tools, quietTurn); providers.push(provider); return provider; },
    ...options,
  });
  servers.push(server);
  const port = await server.start();
  return { server, port, logger, providers };
}

const payloadOf = (message: BridgeEnvelope) => message.payload as Record<string, unknown>;

/** The tab: a WebSocket that starts a session and answers the calls the test tells it to. */
async function openTab(port: number, start: Record<string, unknown> = {}) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:8081' });
  sockets.push(socket);
  const received: BridgeEnvelope[] = [];
  const waiters: Array<{ predicate: (message: BridgeEnvelope) => boolean; resolve: (message: BridgeEnvelope) => void }> = [];
  let answerAll: ((call: Record<string, unknown>) => Record<string, unknown>) | null = null;
  let sessionId = '';
  const send = (type: Parameters<typeof makeEnvelope>[0], payload: unknown) => socket.send(JSON.stringify(makeEnvelope(type, payload, sessionId)));
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString()) as BridgeEnvelope;
    received.push(message);
    if (message.type === 'tool_call' && answerAll) {
      const call = payloadOf(message);
      send('tool_result', { toolCallId: call.toolCallId, ...answerAll(call) });
    }
    waiters.filter(waiter => waiter.predicate(message)).forEach((waiter) => {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    });
  });
  /** The nth message of a type, whether it has arrived yet or not. */
  const message = (type: string, nth = 0) => new Promise<BridgeEnvelope>((resolve) => {
    const predicate = (candidate: BridgeEnvelope) => received.filter(item => item.type === type).indexOf(candidate) === nth;
    const seen = received.filter(item => item.type === type)[nth];
    if (seen) resolve(seen);
    else waiters.push({ predicate, resolve });
  });
  await once(socket, 'open');
  send('session_start', { token: PAIRING_TOKEN, context: { storyId: 'story-1' }, ...start });
  const started = await Promise.race([message('session_started'), message('session_challenge'), message('error')]);
  if (started.type === 'session_started') sessionId = String(payloadOf(started).sessionId);
  return {
    socket,
    send,
    message,
    received,
    started,
    calls: () => received.filter(item => item.type === 'tool_call').map(payloadOf),
    answer: (call: Record<string, unknown>, result: Record<string, unknown>) => send('tool_result', { toolCallId: call.toolCallId, ...result }),
    /** Answers every call from now on, the way a tab that needs no author would. */
    answerEverything: (reply: (call: Record<string, unknown>) => Record<string, unknown>) => { answerAll = reply; },
    endSession: async () => { send('session_end', {}); socket.close(); await once(socket, 'close'); },
  };
}

interface ToolAnswer { value: Record<string, unknown>; isError: boolean }

async function connectAgent(port: number, token = MCP_TOKEN) {
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  agents.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<ToolAnswer> => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(content[0].text) as Record<string, unknown>;
    } catch {
      value = { text: content[0].text };
    }
    return { value, isError: result.isError === true };
  };
  return { client, call };
}

/** A bridge, a tab and an agent that already knows the binding. */
async function setUp(options: Partial<BridgeServerOptions> = {}) {
  const bridge = await startBridge(options);
  const tab = await openTab(bridge.port);
  const agent = await connectAgent(bridge.port);
  const asked = agent.call('get_editor_context');
  const call = payloadOf(await tab.message('tool_call'));
  tab.answer(call, { ok: true, result: { context: null, hint: 'Nothing was handed over.' } });
  const binding = String((await asked).value.binding);
  return { ...bridge, tab, agent, binding };
}

const patch = (description = 'A quieter library') => ({
  storyId: 'story-1',
  sceneId: 'scene-1',
  expectedRevision: 'rev-1',
  explanation: 'Describe the scene',
  operations: [{ op: 'update_scene_metadata', updates: { description } }],
});

const reason = (answer: ToolAnswer) => (answer.value.details as Record<string, unknown> | undefined)?.reason;
const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function post(port: number, headers: Record<string, string>, body: string, method = 'POST', path = '/mcp') {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: text }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

const LIST_TOOLS = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

describe('what an external agent is offered', () => {
  it('is the registry’s external tools and the two that follow a proposal up', async () => {
    const { port } = await startBridge();
    const { client } = await connectAgent(port);

    const { tools } = await client.listTools();

    expect(tools.map(tool => tool.name).sort()).toEqual([
      ...EXTERNAL_BRIDGE_TOOLS.map(tool => tool.name), 'cancel_proposal', 'get_proposal_status',
    ].sort());
    expect(EXTERNAL_BRIDGE_TOOLS.map(tool => tool.name).sort()).toEqual([
      'find_asset_usage', 'get_editor_context', 'get_image_details', 'get_scene', 'get_story_overview',
      'list_scenes', 'list_story_images', 'propose_appearance_patch', 'propose_changeset', 'propose_scene_patch',
    ]);
  });

  it('offers nothing that costs money and nothing that returns bytes', () => {
    expect(BRIDGE_TOOLS.filter(tool => tool.external && (tool.effect === 'cost' || tool.binaryResult || tool.exposure === 'internal'))).toEqual([]);
  });

  it('asks for a binding everywhere but in the call that hands it out, and takes a request key with a proposal', async () => {
    const { port } = await startBridge();
    const { client } = await connectAgent(port);
    const { tools } = await client.listTools();
    const schema = (name: string) => tools.find(tool => tool.name === name)!.inputSchema as { properties: Record<string, unknown>; required?: string[] };

    expect(schema('get_editor_context').properties).not.toHaveProperty('binding');
    for (const tool of tools.filter(item => item.name !== 'get_editor_context')) {
      expect(schema(tool.name).required, tool.name).toContain('binding');
    }
    for (const name of ['propose_scene_patch', 'propose_appearance_patch', 'propose_changeset']) {
      expect(schema(name).properties, name).toHaveProperty('requestId');
      expect(schema(name).required, name).not.toContain('requestId');
    }
    expect(schema('get_scene').properties).not.toHaveProperty('requestId');
  });
});

describe('an external agent reading the story', () => {
  it('gets a binding with the editor context, and the scene through the tab', async () => {
    const { tab, agent, binding } = await setUp();
    const context = tab.calls()[0];
    // Marked as someone else's, and as untrusted: the app asks the author about anything such a call would change.
    expect(context).toMatchObject({ toolName: 'get_editor_context', origin: 'external', untrustedAttachmentMode: true, input: {} });
    expect(context).not.toHaveProperty('ttlMs');
    expect(binding).toMatch(/^[0-9a-f]{24}$/);

    const reading = agent.call('get_scene', { binding, sceneId: 'scene-1' });
    const call = payloadOf(await tab.message('tool_call', 1));
    // The app is not shown the binding: it is between the agent and the bridge.
    expect(call).toMatchObject({ toolName: 'get_scene', origin: 'external', input: { sceneId: 'scene-1' } });
    tab.answer(call, { ok: true, result: { activeScene: { id: 'scene-1', revision: 'rev-1' } } });

    expect(await reading).toEqual({ value: { activeScene: { id: 'scene-1', revision: 'rev-1' } }, isError: false });
  });

  it('is told the story the editor has open', async () => {
    const { port } = await startBridge();
    const tab = await openTab(port, { context: { storyId: 'story-7' } });
    const agent = await connectAgent(port);

    const asked = agent.call('get_editor_context', { mode: 'live' });
    const call = payloadOf(await tab.message('tool_call'));
    expect(call.input).toEqual({ mode: 'live' });
    tab.answer(call, { ok: true, result: { context: { version: 1 } } });

    expect((await asked).value).toMatchObject({ storyId: 'story-7', context: { version: 1 } });
  });

  it('is told when no editor is connected', async () => {
    const { port } = await startBridge();
    const agent = await connectAgent(port);

    const answer = await agent.call('get_editor_context');

    expect(answer.isError).toBe(true);
    expect(reason(answer)).toBe('EDITOR_NOT_CONNECTED');
  });

  it('passes the app’s refusal on as it was given', async () => {
    const { tab, agent, binding } = await setUp();

    const reading = agent.call('list_scenes', { binding });
    tab.answer(payloadOf(await tab.message('tool_call', 1)), {
      ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'External agent access is off', details: { reason: 'EXTERNAL_ACCESS_OFF' },
    });

    expect(await reading).toEqual({
      value: { errorCode: 'PERMISSION_DENIED', errorMessage: 'External agent access is off', details: { reason: 'EXTERNAL_ACCESS_OFF' } },
      isError: true,
    });
  });

  it('is not counted against the chat’s turn and does not stop it', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const bridge = await startBridge({
      providerFactory: tools => new FakeProvider(tools, async function* () {
        // Up to the turn's limit, and not one over.
        for (let index = 0; index < 15; index += 1) await tools.call('list_scenes', {});
        await held;
        const afterwards = await tools.call('list_scenes', {}).catch(modelToolErrorValue);
        yield { type: 'text', text: JSON.stringify(afterwards) };
        yield { type: 'done' };
      }),
    });
    const tab = await openTab(bridge.port);
    tab.answerEverything(() => ({ ok: true, result: [] }));
    const agent = await connectAgent(bridge.port);
    const binding = String((await agent.call('get_editor_context')).value.binding);
    tab.send('user_message', { text: 'go' });
    await tab.message('tool_call', 15);

    for (let index = 0; index < 5; index += 1) {
      expect((await agent.call('list_scenes', { binding })).isError).toBe(false);
    }
    release();

    // The sixteenth call of the turn is the one that goes over, not an agent's.
    expect(payloadOf(await tab.message('assistant_done')).stopReason).toBe('tool_limit');
    expect(tab.calls().filter(call => call.origin === 'external')).toHaveLength(6);
  });
});

describe('a proposal from an external agent', () => {
  it('answers pending at once, shows the author a card, and reads applied afterwards', async () => {
    const { tab, agent, binding } = await setUp();

    const proposed = await agent.call('propose_scene_patch', { binding, patch: patch() });

    expect(proposed.isError).toBe(false);
    expect(proposed.value).toMatchObject({ status: 'pending', expiresInSeconds: 600 });
    const proposalId = String(proposed.value.proposalId);
    const card = payloadOf(await tab.message('tool_call', 1));
    expect(card).toMatchObject({
      toolCallId: proposalId, toolName: 'propose_scene_patch', origin: 'external', untrustedAttachmentMode: true, ttlMs: 600_000,
      input: { patch: patch() },
    });
    expect((await agent.call('get_proposal_status', { binding, proposalId })).value).toMatchObject({ status: 'pending' });

    tab.answer(card, { ok: true, result: { accepted: true } });

    expect(payloadOf(await tab.message('tool_result_ack'))).toEqual({ toolCallId: proposalId });
    expect((await agent.call('get_proposal_status', { binding, proposalId })).value).toEqual({ proposalId, status: 'applied' });
  });

  it('lets the agent wait for the author instead of asking again and again', async () => {
    const { tab, agent, binding } = await setUp();
    const proposalId = String((await agent.call('propose_scene_patch', { binding, patch: patch() })).value.proposalId);
    const card = payloadOf(await tab.message('tool_call', 1));

    const waiting = agent.call('get_proposal_status', { binding, proposalId, waitSeconds: 20 });
    await tick(30);
    tab.answer(card, { ok: true, result: { accepted: false, reason: 'rejected' } });

    expect((await waiting).value).toMatchObject({ status: 'rejected', reason: 'rejected', hint: expect.stringContaining('Read the current state again') });
  });

  it('answers pending when the wait is over and the author has not decided', async () => {
    const { tab, agent, binding } = await setUp();
    const proposalId = String((await agent.call('propose_scene_patch', { binding, patch: patch() })).value.proposalId);
    await tab.message('tool_call', 1);

    expect((await agent.call('get_proposal_status', { binding, proposalId, waitSeconds: 0.05 })).value).toMatchObject({ status: 'pending' });
  });

  it('is one proposal however many times it is sent under the same request key', async () => {
    const { tab, agent, binding } = await setUp();

    const first = await agent.call('propose_scene_patch', { binding, requestId: 'retry-1', patch: patch() });
    const again = await agent.call('propose_scene_patch', { binding, requestId: 'retry-1', patch: patch() });

    expect(again.value.proposalId).toBe(first.value.proposalId);
    await tick(20);
    expect(tab.calls().filter(call => call.toolName === 'propose_scene_patch')).toHaveLength(1);
  });

  it('holds the session against a chat message that arrives before the card is even shown', async () => {
    const { tab, agent, binding, providers } = await setUp();

    await agent.call('propose_scene_patch', { binding, patch: patch() });
    tab.send('user_message', { text: 'and another thing' });

    expect(payloadOf(await tab.message('error'))).toMatchObject({ details: { reason: 'PROPOSAL_PENDING' } });
    expect(providers[0].sent).toBe(0);
  });

  it('is refused while another one waits, and while the chat’s turn is running', async () => {
    const { tab, agent, binding } = await setUp();
    await agent.call('propose_scene_patch', { binding, patch: patch() });

    const second = await agent.call('propose_appearance_patch', { binding, patch: { storyId: 'story-1', expectedRevision: 'rev', explanation: 'Darker' } });

    expect(second.isError).toBe(true);
    expect(reason(second)).toBe('INTERACTION_PENDING');
    expect(tab.calls().filter(call => String(call.toolName).startsWith('propose_'))).toHaveLength(1);

    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const busy = await startBridge({ providerFactory: tools => new FakeProvider(tools, async function* () { await held; yield { type: 'done' }; }) });
    const busyTab = await openTab(busy.port);
    busyTab.answerEverything(() => ({ ok: true, result: { context: null } }));
    const busyAgent = await connectAgent(busy.port);
    const busyBinding = String((await busyAgent.call('get_editor_context')).value.binding);
    busyTab.send('user_message', { text: 'think for a while' });
    await tick(20);

    const during = await busyAgent.call('propose_scene_patch', { binding: busyBinding, patch: patch() });

    expect(reason(during)).toBe('CHAT_TURN_RUNNING');
    release();
  });

  it('can be taken back, and still reads applied if the author was faster', async () => {
    const { tab, agent, binding } = await setUp();
    const proposalId = String((await agent.call('propose_scene_patch', { binding, patch: patch() })).value.proposalId);
    const card = payloadOf(await tab.message('tool_call', 1));

    const cancelled = await agent.call('cancel_proposal', { binding, proposalId });

    expect(cancelled.value).toMatchObject({ status: 'cancelled', reason: 'CANCELLED_BY_AGENT' });
    expect(payloadOf(await tab.message('tool_cancel'))).toEqual({ toolCallId: proposalId, reason: 'CANCELLED_BY_AGENT' });
    // Cancelling again changes nothing and is not an error.
    expect((await agent.call('cancel_proposal', { binding, proposalId })).value).toMatchObject({ status: 'cancelled' });

    // The author's Apply crossed the withdrawal: the change is in the story.
    tab.answer(card, { ok: true, result: { accepted: true } });
    await tab.message('tool_result_ack');

    expect((await agent.call('get_proposal_status', { binding, proposalId })).value).toEqual({ proposalId, status: 'applied' });
  });

  // The bridge remembers how a call ended so that a late answer can correct an
  // ending it had to settle alone. It used to remember sixty-four of them.
  it('still learns that a withdrawn proposal was applied after many others have come and gone', async () => {
    const { tab, agent, binding } = await setUp();
    const proposalId = String((await agent.call('propose_scene_patch', { binding, patch: patch() })).value.proposalId);
    const card = payloadOf(await tab.message('tool_call', 1));
    await agent.call('cancel_proposal', { binding, proposalId });
    tab.answerEverything(() => ({ ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Not now' }));
    for (let index = 0; index < 70; index += 1) {
      expect((await agent.call('propose_scene_patch', { binding, patch: patch() })).isError, String(index)).toBe(false);
      // Refused by the tab at once; the next one can go when the bridge has heard.
      await tab.message('tool_result_ack', index);
    }

    tab.answer(card, { ok: true, result: { accepted: true } });

    expect(payloadOf(await tab.message('tool_result_ack', 70))).toEqual({ toolCallId: proposalId });
    expect((await agent.call('get_proposal_status', { binding, proposalId })).value).toEqual({ proposalId, status: 'applied' });
  });

  it('frees the session once it has ended, for the next proposal and for the chat', async () => {
    const { tab, agent, binding, providers } = await setUp();
    const proposalId = String((await agent.call('propose_scene_patch', { binding, patch: patch() })).value.proposalId);
    await agent.call('cancel_proposal', { binding, proposalId });

    expect((await agent.call('propose_scene_patch', { binding, patch: patch() })).value).toMatchObject({ status: 'pending' });
    const second = payloadOf(await tab.message('tool_call', 2));
    tab.answer(second, { ok: true, result: { accepted: false, reason: 'rejected' } });
    await tab.message('tool_result_ack');
    tab.send('user_message', { text: 'now me' });
    await tab.message('assistant_done');

    expect(providers[0].sent).toBe(1);
  });

  it('says why the app would not take it', async () => {
    const { tab, agent, binding } = await setUp();
    const proposalId = String((await agent.call('propose_scene_patch', { binding, patch: patch() })).value.proposalId);

    tab.answer(payloadOf(await tab.message('tool_call', 1)), {
      ok: false, errorCode: 'STALE_REVISION', errorMessage: 'The scene changed since it was read', details: { reason: 'SCENE_CHANGED' },
    });
    await tab.message('tool_result_ack');

    expect((await agent.call('get_proposal_status', { binding, proposalId })).value).toEqual({
      proposalId,
      status: 'failed',
      reason: 'STALE_REVISION',
      detail: 'SCENE_CHANGED',
      message: 'The scene changed since it was read',
      hint: 'Read the current state again before proposing anything else.',
    });
  });

  it('reads unknown when the editor never said how it ended', async () => {
    const { tab, agent, binding } = await setUp({ authorWaitTtlMs: 40, authorWaitGraceMs: 10 });
    const proposed = await agent.call('propose_scene_patch', { binding, patch: patch() });
    expect(proposed.value.expiresInSeconds).toBe(1);
    const proposalId = String(proposed.value.proposalId);

    expect(payloadOf(await tab.message('tool_cancel'))).toEqual({ toolCallId: proposalId, reason: 'EXPIRED' });

    expect((await agent.call('get_proposal_status', { binding, proposalId })).value).toMatchObject({ status: 'unknown' });
    // And the session is free again.
    expect((await agent.call('propose_scene_patch', { binding, patch: patch() })).value).toMatchObject({ status: 'pending' });
  });

  it('is not passed on when it is not a patch', async () => {
    const { tab, agent, binding } = await setUp();

    const answer = await agent.call('propose_scene_patch', { binding, patch: { storyId: 'story-1' } });

    expect(answer.isError).toBe(true);
    await tick(20);
    expect(tab.calls()).toHaveLength(1);
  });

  it('answers only to the binding it was made under', async () => {
    const { agent, binding } = await setUp();
    const proposalId = String((await agent.call('propose_scene_patch', { binding, patch: patch() })).value.proposalId);

    expect(reason(await agent.call('get_proposal_status', { binding: 'someone-else', proposalId }))).toBe('BINDING_MISMATCH');
    expect(reason(await agent.call('cancel_proposal', { binding: 'someone-else', proposalId }))).toBe('BINDING_MISMATCH');
    expect(reason(await agent.call('get_proposal_status', { binding, proposalId: 'no-such-proposal' }))).toBe('PROPOSAL_NOT_FOUND');
  });
});

describe('when the author moves to another story', () => {
  it('cancels the proposal, which the agent can still read, and refuses the old binding everywhere else', async () => {
    const { port, tab, agent, binding } = await setUp();
    const proposalId = String((await agent.call('propose_scene_patch', { binding, patch: patch() })).value.proposalId);
    await tab.message('tool_call', 1);

    await tab.endSession();
    const next = await openTab(port, { context: { storyId: 'story-2' } });

    // Under the binding it was made with, not the one that is current.
    expect((await agent.call('get_proposal_status', { binding, proposalId })).value).toMatchObject({ status: 'cancelled', reason: 'SESSION_ENDED' });
    const stale = await agent.call('get_scene', { binding, sceneId: 'scene-1' });
    expect(reason(stale)).toBe('BINDING_STALE');
    expect((stale.value.details as Record<string, unknown>).hint).toContain('get_editor_context');
    expect(reason(await agent.call('propose_scene_patch', { binding, patch: patch() }))).toBe('BINDING_STALE');
    expect(next.calls()).toEqual([]);

    const asked = agent.call('get_editor_context');
    next.answer(payloadOf(await next.message('tool_call')), { ok: true, result: { context: null } });
    const fresh = (await asked).value;
    expect(fresh.binding).not.toBe(binding);
    expect(fresh.storyId).toBe('story-2');
  });

  // A reload leaves the session's id in the tab, and nothing tells the bridge
  // the old page is gone. The id used to be enough to resume: the binding and
  // the story's name stayed, and the agent went on reading whatever the tab
  // had open by then.
  it('does not carry the binding over when the tab that kept the session id has another story open', async () => {
    const { port, tab, agent, binding } = await setUp();
    const sessionId = String(payloadOf(tab.started).sessionId);
    const proposalId = String((await agent.call('propose_scene_patch', { binding, patch: patch() })).value.proposalId);
    await tab.message('tool_call', 1);
    // No session_end: the page was reloaded, or went to another address.
    tab.socket.close();
    await once(tab.socket, 'close');

    const next = await openTab(port, { resumeSessionId: sessionId, context: { storyId: 'story-2' } });

    expect(payloadOf(next.started)).toMatchObject({ resumed: false });
    expect(payloadOf(next.started).sessionId).not.toBe(sessionId);
    expect(reason(await agent.call('get_scene', { binding, sceneId: 'scene-1' }))).toBe('BINDING_STALE');
    expect(reason(await agent.call('propose_scene_patch', { binding, patch: patch() }))).toBe('BINDING_STALE');
    expect(next.calls()).toEqual([]);
    // What was proposed for the first story does not wait for the author of the second.
    expect((await agent.call('get_proposal_status', { binding, proposalId })).value).toMatchObject({ status: 'cancelled', reason: 'SESSION_ENDED' });

    const asked = agent.call('get_editor_context');
    next.answer(payloadOf(await next.message('tool_call')), { ok: true, result: { context: null } });
    const fresh = (await asked).value;
    expect(fresh.binding).not.toBe(binding);
    expect(fresh.storyId).toBe('story-2');
  });

  it('ends the first story’s session even for a tab that is still on the line', async () => {
    const { port, tab, agent, binding } = await setUp();
    const sessionId = String(payloadOf(tab.started).sessionId);
    const closed = once(tab.socket, 'close') as Promise<[number, Buffer]>;

    const next = await openTab(port, { resumeSessionId: sessionId, context: { storyId: 'story-2' } });

    const [code, why] = await closed;
    expect([code, why.toString()]).toEqual([1000, SESSION_RESUMED_ELSEWHERE]);
    expect(payloadOf(next.started)).toMatchObject({ resumed: false });
    expect(reason(await agent.call('list_scenes', { binding }))).toBe('BINDING_STALE');
  });

  it('takes a story named for the first time, or no longer named, for another story', async () => {
    const { port } = await startBridge();
    const unnamed = await openTab(port, { context: {} });
    const sessionId = String(payloadOf(unnamed.started).sessionId);
    unnamed.socket.close();
    await once(unnamed.socket, 'close');

    const named = await openTab(port, { resumeSessionId: sessionId, context: { storyId: 'story-1' } });
    expect(payloadOf(named.started)).toMatchObject({ resumed: false });
    const namedId = String(payloadOf(named.started).sessionId);
    named.socket.close();
    await once(named.socket, 'close');

    const again = await openTab(port, { resumeSessionId: namedId, context: {} });
    expect(payloadOf(again.started)).toMatchObject({ resumed: false });
  });

  it('keeps the binding for a tab that only reconnected', async () => {
    const { port, tab, agent, binding } = await setUp();
    const sessionId = String(payloadOf(tab.started).sessionId);
    tab.socket.close();
    await once(tab.socket, 'close');
    expect(reason(await agent.call('list_scenes', { binding }))).toBe('EDITOR_NOT_CONNECTED');

    const back = await openTab(port, { resumeSessionId: sessionId });
    expect(payloadOf(back.started)).toMatchObject({ sessionId, resumed: true });
    const reading = agent.call('list_scenes', { binding });
    back.answer(payloadOf(await back.message('tool_call')), { ok: true, result: [] });

    expect((await reading).isError).toBe(false);
  });
});

describe('a bridge that runs without chat', () => {
  it('starts a session whatever provider the app prefers, and names none', async () => {
    const { port } = await startBridge({ providerFactory: undefined });

    const tab = await openTab(port, { preferredProvider: 'openai' });

    expect(tab.started.type).toBe('session_started');
    const started = payloadOf(tab.started);
    expect(started).not.toHaveProperty('provider');
    expect(started.capabilities).toMatchObject({ chat: { supported: false }, externalAgent: { enabled: true }, attachments: { supported: false } });
  });

  it('answers a message with a reason instead of a turn, and still serves the agent', async () => {
    const { port } = await startBridge({ providerFactory: undefined });
    const tab = await openTab(port);
    const agent = await connectAgent(port);

    tab.send('user_message', { text: 'hello?' });
    expect(payloadOf(await tab.message('error'))).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', details: { reason: 'CHAT_UNSUPPORTED' } });
    tab.send('interrupt', {});

    const asked = agent.call('get_editor_context');
    tab.answer(payloadOf(await tab.message('tool_call')), { ok: true, result: { context: null } });
    expect((await asked).isError).toBe(false);
  });

  it('tells a bridge with chat apart by its capabilities alone', async () => {
    const { port } = await startBridge({ mcp: undefined });
    const tab = await openTab(port);

    expect(payloadOf(tab.started)).toMatchObject({ provider: 'claude', capabilities: { chat: { supported: true } } });
    expect(payloadOf(tab.started).capabilities).not.toHaveProperty('externalAgent');
  });
});

describe('who may reach the MCP endpoint', () => {
  const authorized = { authorization: `Bearer ${MCP_TOKEN}` };

  it('answers the agent that has the token', async () => {
    const { port } = await startBridge();

    const answer = await post(port, authorized, LIST_TOOLS);

    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body).result.tools.length).toBeGreaterThan(0);
  });

  it('refuses a call with no token, a wrong one, or the editor’s pairing token', async () => {
    const { port } = await startBridge();

    const attempts: Record<string, string>[] = [{}, { authorization: 'Bearer nope' }, { authorization: `Bearer ${PAIRING_TOKEN}` }, { authorization: MCP_TOKEN }];
    for (const headers of attempts) {
      const answer = await post(port, headers, LIST_TOOLS);
      expect(answer.status, JSON.stringify(headers)).toBe(401);
      expect(answer.headers['www-authenticate']).toContain('Bearer');
    }
  });

  it('refuses a web page that is not the editor, even with the token', async () => {
    const { port } = await startBridge();

    expect((await post(port, { ...authorized, origin: 'https://evil.example' }, LIST_TOOLS)).status).toBe(403);
    expect((await post(port, { ...authorized, origin: 'http://localhost:9999' }, LIST_TOOLS)).status).toBe(403);
    expect((await post(port, { ...authorized, origin: 'http://localhost:8081' }, LIST_TOOLS)).status).toBe(200);
  });

  // A page that points its own domain at 127.0.0.1 gets here with that domain as the Host.
  it('refuses a request whose Host is not a loopback name', async () => {
    const { port } = await startBridge();

    expect((await post(port, { ...authorized, host: `attacker.example:${port}` }, LIST_TOOLS)).status).toBe(403);
    expect((await post(port, { ...authorized, host: `localhost:${port}` }, LIST_TOOLS)).status).toBe(200);
  });

  it('takes only POST, and no body larger than a message may be', async () => {
    const { port } = await startBridge();

    const get = await post(port, authorized, '', 'GET');
    expect(get.status).toBe(405);
    expect(get.headers.allow).toBe('POST');
    expect((await post(port, authorized, '', 'DELETE')).status).toBe(405);
    expect((await post(port, authorized, 'not json')).status).toBe(400);
    expect((await post(port, authorized, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { filler: 'x'.repeat(1_100_000) } }))).status).toBe(413);
  });

  it('does not exist on a bridge started without it', async () => {
    const { port } = await startBridge({ mcp: undefined });

    const answer = await post(port, authorized, LIST_TOOLS);

    // What any plain HTTP request to the bridge has always been answered with.
    expect(answer.status).toBe(426);
    expect(answer.body).toBe('Upgrade Required');
    expect((await post(port, {}, '', 'GET', '/')).status).toBe(426);
  });
});

describe('what the bridge writes down about an external call', () => {
  it('names the tool, how it went and how long it took, and none of the author’s text', async () => {
    const { tab, agent, binding, logger } = await setUp();
    const reading = agent.call('get_scene', { binding, sceneId: 'scene-with-a-secret-name' });
    tab.answer(payloadOf(await tab.message('tool_call', 1)), { ok: true, result: { text: 'The butler did it.' } });
    await reading;
    await agent.call('propose_scene_patch', { binding, patch: patch('Nobody may read this in a log') });
    await agent.call('list_scenes', { binding: 'stale' });

    const lines = logger.mock.calls.map(([line]) => line);

    expect(lines).toEqual(expect.arrayContaining([
      expect.stringMatching(/^AI Bridge external get_scene ok \d+ms$/),
      expect.stringMatching(/^AI Bridge external propose_scene_patch ok \d+ms$/),
      expect.stringMatching(/^AI Bridge external list_scenes BINDING_STALE \d+ms$/),
    ]));
    const everything = lines.join('\n');
    for (const secret of ['The butler did it', 'Nobody may read this', 'scene-with-a-secret-name', binding, MCP_TOKEN]) {
      expect(everything).not.toContain(secret);
    }
  });
});

describe('the gate, on its own clock', () => {
  function gateWith(session: Partial<EditorSessionView> | null = {}) {
    let now = 1_000_000;
    let ids = 0;
    const view: EditorSessionView | null = session && { binding: 'b1', connected: true, chatTurnRunning: false, interactionPending: false, ...session };
    const editor: EditorPort & { withdrawn: string[] } = {
      withdrawn: [],
      session: () => view,
      read: vi.fn(async () => ({})),
      propose: vi.fn(() => `proposal-${ids += 1}`),
      withdraw(proposalId) { this.withdrawn.push(proposalId); },
    };
    const gate = new ExternalAgentGate({ editor, now: () => now, ttlMs: 600_000 });
    return { gate, editor, advance: (ms: number) => { now += ms; } };
  }

  it('lets through a hundred and twenty calls a minute and not one more', () => {
    const { gate, advance } = gateWith();
    for (let index = 0; index < EXTERNAL_CALLS_PER_MINUTE; index += 1) gate.admit();

    let refused: unknown;
    try { gate.admit(); } catch (error) { refused = modelToolErrorValue(error); }
    expect(refused).toMatchObject({ errorCode: 'PROVIDER_UNAVAILABLE', details: { reason: 'RATE_LIMITED', retryAfterSeconds: 60 } });

    advance(30_000);
    expect(() => gate.admit()).toThrow();
    advance(30_001);
    expect(() => gate.admit()).not.toThrow();
  });

  it('keeps an outcome for fifteen minutes after it is known, and a pending proposal for as long as it is pending', async () => {
    const { gate, advance } = gateWith();
    const { proposalId } = gate.propose('propose_scene_patch', 'b1', undefined, { patch: patch() });

    advance(PROPOSAL_KEPT_MS * 2);
    expect((await gate.proposalStatus(proposalId, 'b1')).status).toBe('pending');
    gate.settle(proposalId, { status: 'applied' });
    advance(PROPOSAL_KEPT_MS - 1);
    expect((await gate.proposalStatus(proposalId, 'b1')).status).toBe('applied');

    advance(2);
    await expect(gate.proposalStatus(proposalId, 'b1')).rejects.toMatchObject({ details: { reason: 'PROPOSAL_NOT_FOUND' } });
  });

  it('counts down how long the author still has', () => {
    const { gate, advance } = gateWith();
    expect(gate.propose('propose_scene_patch', 'b1', 'key', { patch: patch() }).expiresInSeconds).toBe(600);

    advance(90_500);

    expect(gate.propose('propose_scene_patch', 'b1', 'key', { patch: patch() }).expiresInSeconds).toBe(510);
  });

  it('takes a request key to mean the same proposal only under the same binding', () => {
    const { gate, editor } = gateWith();
    const first = gate.propose('propose_scene_patch', 'b1', 'key', { patch: patch() });
    gate.settle(first.proposalId, { status: 'rejected' });

    // The first one is over, so the session is free, and the key still means the first one.
    expect(gate.propose('propose_scene_patch', 'b1', 'key', { patch: patch() })).toMatchObject({ proposalId: first.proposalId, status: 'rejected' });
    expect(editor.propose).toHaveBeenCalledTimes(1);
    expect(() => gate.propose('propose_scene_patch', 'b2', 'key', { patch: patch() })).toThrow(/no longer the one that is open/);
  });

  // An outcome used to be dropped as soon as sixty-four later ones existed:
  // its status was gone, and its request key made a second proposal.
  it('keeps an outcome for its fifteen minutes however many proposals come after it', async () => {
    const { gate, editor } = gateWith();
    const first = gate.propose('propose_scene_patch', 'b1', 'first', { patch: patch() });
    gate.settle(first.proposalId, { status: 'applied' });
    for (let index = 0; index < 200; index += 1) {
      const later = gate.propose('propose_scene_patch', 'b1', `later-${index}`, { patch: patch() });
      gate.settle(later.proposalId, { status: 'rejected' });
    }

    expect(gate.propose('propose_scene_patch', 'b1', 'first', { patch: patch() })).toEqual({ proposalId: first.proposalId, status: 'applied' });
    expect(editor.propose).toHaveBeenCalledTimes(201);
    expect((await gate.proposalStatus(first.proposalId, 'b1')).status).toBe('applied');
  });

  it('refuses a new proposal rather than forget one it still owes an answer about', () => {
    const { gate, editor, advance } = gateWith();
    for (let index = 0; index < PROPOSALS_AT_MOST; index += 1) {
      gate.settle(gate.propose('propose_scene_patch', 'b1', undefined, { patch: patch() }).proposalId, { status: 'rejected' });
    }

    let refused: unknown;
    try { gate.propose('propose_scene_patch', 'b1', 'one-too-many', { patch: patch() }); } catch (error) { refused = modelToolErrorValue(error); }
    expect(refused).toMatchObject({ errorCode: 'PROVIDER_UNAVAILABLE', details: { reason: 'TOO_MANY_PROPOSALS' } });
    expect(editor.propose).toHaveBeenCalledTimes(PROPOSALS_AT_MOST);

    // The oldest have had their fifteen minutes; there is room again.
    advance(PROPOSAL_KEPT_MS + 1);
    expect(gate.propose('propose_scene_patch', 'b1', 'one-too-many', { patch: patch() })).toMatchObject({ status: 'pending' });
  });

  it('proposes nothing through a tool that only reads, and reads nothing the registry does not offer outside', async () => {
    const { gate, editor } = gateWith();

    expect(() => gate.propose('get_scene', 'b1', undefined, { sceneId: 's' })).toThrow(/does not propose/);
    await expect(gate.read('generate_image', 'b1', { prompt: 'a cat', purpose: 'other' })).rejects.toMatchObject({ details: { reason: 'TOOL_NOT_EXTERNAL' } });
    await expect(gate.read('get_image_binary', 'b1', { assetId: 'a' })).rejects.toMatchObject({ details: { reason: 'TOOL_NOT_EXTERNAL' } });
    expect(editor.read).not.toHaveBeenCalled();
    expect(editor.propose).not.toHaveBeenCalled();
  });

  it('settles a withdrawal itself when the server no longer knows the proposal', () => {
    const { gate, editor } = gateWith();
    const { proposalId } = gate.propose('propose_scene_patch', 'b1', undefined, { patch: patch() });

    expect(gate.cancelProposal(proposalId, 'b1')).toMatchObject({ status: 'cancelled', reason: 'CANCELLED_BY_AGENT' });
    expect(editor.withdrawn).toEqual([proposalId]);
  });
});
