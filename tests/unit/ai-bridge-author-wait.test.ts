// @vitest-environment node
import { once } from 'node:events';
import WebSocket from 'ws';
import { AUTHOR_WAIT_TTL_MS, BRIDGE_TOOLS } from '../../src/lib/ai/bridge-tools';
import { makeEnvelope, type BridgeEnvelope } from '../../src/lib/bridge-protocol';
import { modelToolErrorValue, type AgentEvent, type AgentProvider, type ToolInvoker } from '../../tools/ai-bridge/src/provider';
import { AiBridgeServer, type BridgeServerOptions } from '../../tools/ai-bridge/src/server';
import { AuthorWait, envForAuthorWait, startTurnBudget } from '../../tools/ai-bridge/src/turn-budget';

class FakeProvider implements AgentProvider {
  aborted = false;
  constructor(readonly tools: ToolInvoker, private readonly behavior: (self: FakeProvider) => AsyncIterable<AgentEvent>) {}
  send() { return this.behavior(this); }
  abort() { this.aborted = true; }
  resetConversation() {}
}

const servers: AiBridgeServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });

/** A session with a turn already running; messages the bridge sends are kept in order. */
async function startTurn(behavior: (provider: FakeProvider) => AsyncIterable<AgentEvent>, options: Partial<BridgeServerOptions> = {}) {
  let provider!: FakeProvider;
  const server = new AiBridgeServer({
    port: 0, token: 'test-token', logger: vi.fn(), providerFactory: tools => provider = new FakeProvider(tools, behavior), ...options,
  });
  servers.push(server);
  const socket = new WebSocket(`ws://127.0.0.1:${await server.start()}`, { origin: 'http://localhost:8081' });
  const received: BridgeEnvelope[] = [];
  const waiters: Array<{ predicate: (message: BridgeEnvelope) => boolean; resolve: (message: BridgeEnvelope) => void }> = [];
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString()) as BridgeEnvelope;
    received.push(message);
    waiters.filter(waiter => waiter.predicate(message)).forEach((waiter) => {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    });
  });
  /** The first message of a type, whether it has arrived yet or not. */
  const message = (type: string, nth = 0) => new Promise<BridgeEnvelope>((resolve) => {
    const predicate = (candidate: BridgeEnvelope) => received.filter(item => item.type === type).indexOf(candidate) === nth;
    const seen = received.filter(item => item.type === type)[nth];
    if (seen) resolve(seen);
    else waiters.push({ predicate, resolve });
  });
  await once(socket, 'open');
  let sessionId = '';
  const send = (type: Parameters<typeof makeEnvelope>[0], payload: unknown) => socket.send(JSON.stringify(makeEnvelope(type, payload, sessionId)));
  send('session_start', { token: 'test-token' });
  sessionId = String(payloadOf(await message('session_started')).sessionId);
  send('user_message', { text: 'go' });
  return { server, socket, send, message, received, get provider() { return provider; } };
}

const payloadOf = (message: BridgeEnvelope) => message.payload as Record<string, unknown>;
const askPermission = (tools: ToolInvoker) => tools.call('authorize_capability', { capability: 'image_generate' });
const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('a bridge call that waits for the author', () => {
  it('is marked in the registry for every proposal and for the paid permission', () => {
    expect(BRIDGE_TOOLS.filter(tool => tool.awaitsAuthor).map(tool => tool.name).sort())
      .toEqual(['authorize_capability', 'propose_appearance_patch', 'propose_changeset', 'propose_scene_patch']);
  });

  it('carries a lifetime, which a call that reads does not', async () => {
    const turn = await startTurn(async function* (provider) {
      void provider.tools.call('get_scene', { sceneId: 's1' }).catch(() => undefined);
      await askPermission(provider.tools).catch(() => undefined);
      yield { type: 'done' };
    });

    const read = payloadOf(await turn.message('tool_call', 0));
    const asked = payloadOf(await turn.message('tool_call', 1));

    expect(read).not.toHaveProperty('ttlMs');
    expect(asked).toMatchObject({ toolName: 'authorize_capability', ttlMs: AUTHOR_WAIT_TTL_MS, origin: 'chat' });
  });

  it.each([
    [{ ok: true, result: { allowed: true } }, { status: 'applied' }],
    [{ ok: true, result: { accepted: true } }, { status: 'applied' }],
    [{ ok: true, result: { accepted: false, reason: 'rejected' } }, { status: 'rejected', reason: 'rejected' }],
    [{ ok: true, result: { allowed: false } }, { status: 'rejected' }],
    [{ ok: true, result: { accepted: false, reason: 'expired' } }, { status: 'expired' }],
    [{ ok: true, result: { accepted: false, reason: 'cancelled' } }, { status: 'cancelled' }],
    [{ ok: false, errorCode: 'STALE_REVISION', errorMessage: 'Scene changed' }, { status: 'failed', reason: 'STALE_REVISION' }],
  ])('hands the model the app’s answer %j, acknowledges it and keeps how it ended', async (answer, outcome) => {
    let seen: unknown;
    const turn = await startTurn(async function* (provider) {
      seen = await askPermission(provider.tools).catch(modelToolErrorValue);
      yield { type: 'done' };
    });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);
    expect(turn.server.interactionStatus(toolCallId)).toBeUndefined();

    turn.send('tool_result', { toolCallId, ...answer });

    expect(payloadOf(await turn.message('tool_result_ack'))).toEqual({ toolCallId });
    await turn.message('assistant_done');
    expect(seen).toEqual('result' in answer ? answer.result : expect.objectContaining({ errorCode: 'STALE_REVISION' }));
    expect(turn.server.interactionStatus(toolCallId)).toEqual(outcome);
  });

  // The app resends an answer until it hears it was received.
  it('acknowledges an answer sent twice and keeps the first', async () => {
    const turn = await startTurn(async function* (provider) {
      await askPermission(provider.tools);
      yield { type: 'done' };
    });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);

    turn.send('tool_result', { toolCallId, ok: true, result: { accepted: true } });
    await turn.message('tool_result_ack', 0);
    turn.send('tool_result', { toolCallId, ok: true, result: { accepted: false, reason: 'rejected' } });
    await turn.message('tool_result_ack', 1);

    expect(turn.server.interactionStatus(toolCallId)).toEqual({ status: 'applied' });
  });

  it('acknowledges nothing for a call that never waited for the author', async () => {
    const turn = await startTurn(async function* (provider) {
      await provider.tools.call('get_scene', { sceneId: 's1' });
      yield { type: 'done' };
    });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);

    turn.send('tool_result', { toolCallId, ok: true, result: {} });
    await turn.message('assistant_done');
    turn.send('tool_result', { toolCallId, ok: true, result: {} });
    await tick(20);

    expect(turn.received.some(message => message.type === 'tool_result_ack')).toBe(false);
  });

  // Nobody can say whether a change was applied by an app that went silent.
  it('withdraws the card of an app that never answers and calls the outcome unknown', async () => {
    let seen: unknown;
    const turn = await startTurn(async function* (provider) {
      seen = await askPermission(provider.tools).catch(modelToolErrorValue);
      yield { type: 'done' };
    }, { authorWaitTtlMs: 20, authorWaitGraceMs: 10 });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);

    expect(payloadOf(await turn.message('tool_cancel'))).toEqual({ toolCallId, reason: 'EXPIRED' });
    await turn.message('assistant_done');

    expect(seen).toMatchObject({ details: { status: 'unknown' } });
    expect(turn.server.interactionStatus(toolCallId)).toEqual({ status: 'unknown' });
  });

  it('withdraws the card when the author stops the turn, and a late answer changes nothing', async () => {
    const turn = await startTurn(async function* (provider) {
      await askPermission(provider.tools).catch(() => undefined);
      yield { type: 'done' };
    });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);

    turn.send('interrupt', {});

    expect(payloadOf(await turn.message('tool_cancel'))).toEqual({ toolCallId, reason: 'INTERRUPTED' });
    expect(payloadOf(await turn.message('assistant_done'))).toMatchObject({ stopReason: 'interrupted' });
    turn.send('tool_result', { toolCallId, ok: true, result: { accepted: false, reason: 'rejected' } });
    await turn.message('tool_result_ack');
    expect(turn.server.interactionStatus(toolCallId)).toEqual({ status: 'cancelled', reason: 'INTERRUPTED' });
  });

  // The app writes nothing for a call it knows was withdrawn, so "applied"
  // after a withdrawal means the write had already happened when they crossed.
  it('takes the app’s word that a change was written before the withdrawal reached it', async () => {
    const turn = await startTurn(async function* (provider) {
      await askPermission(provider.tools).catch(() => undefined);
      yield { type: 'done' };
    });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);
    turn.send('interrupt', {});
    await turn.message('tool_cancel');

    turn.send('tool_result', { toolCallId, ok: true, result: { accepted: true } });
    await turn.message('tool_result_ack');

    expect(turn.server.interactionStatus(toolCallId)).toEqual({ status: 'applied' });
  });

  it.each([
    [{ ok: true, result: { accepted: true } }, { status: 'applied' }],
    [{ ok: true, result: { accepted: false, reason: 'rejected' } }, { status: 'rejected', reason: 'rejected' }],
  ])('learns how an unknown outcome ended when the app comes back with %j', async (answer, outcome) => {
    const turn = await startTurn(async function* (provider) {
      await askPermission(provider.tools).catch(() => undefined);
      yield { type: 'done' };
    }, { authorWaitTtlMs: 20, authorWaitGraceMs: 10 });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);
    await turn.message('tool_cancel');
    expect(turn.server.interactionStatus(toolCallId)).toEqual({ status: 'unknown' });

    turn.send('tool_result', { toolCallId, ...answer });
    await turn.message('tool_result_ack');

    expect(turn.server.interactionStatus(toolCallId)).toEqual(outcome);
  });

  it('withdraws the card when its turn ends without waiting for it', async () => {
    const turn = await startTurn(async function* (provider) {
      void askPermission(provider.tools).catch(() => undefined);
      await tick(10);
      yield { type: 'done' };
    });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);

    expect(payloadOf(await turn.message('tool_cancel'))).toEqual({ toolCallId, reason: 'TURN_ENDED' });
    expect(turn.server.interactionStatus(toolCallId)).toMatchObject({ status: 'cancelled' });
  });

  it('refuses a new message while a proposal waits, and says that is why', async () => {
    const turn = await startTurn(async function* (provider) {
      await askPermission(provider.tools).catch(() => undefined);
      yield { type: 'done' };
    });
    await turn.message('tool_call');

    turn.send('user_message', { text: 'and another thing' });

    expect(payloadOf(await turn.message('error'))).toMatchObject({ details: { reason: 'PROPOSAL_PENDING' } });
  });

  it('does not spend the turn’s time while the author decides', async () => {
    const turn = await startTurn(async function* (provider) {
      await askPermission(provider.tools);
      yield { type: 'done' };
    }, { turnTimeoutMs: 60 });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);

    await tick(150);
    turn.send('tool_result', { toolCallId, ok: true, result: { allowed: true } });

    expect(payloadOf(await turn.message('assistant_done'))).toMatchObject({ stopReason: 'end_turn' });
  });

  // Only the clock is faked, so the time a turn has spent before it asks is
  // exact however busy the machine is, while its timer still runs for real.
  // The turn asks with 50 ms of its minute left: given the whole minute again,
  // or a clock that never started again, it would outlast the test.
  it('goes on with what was left of the turn’s time once the author has decided', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => { vi.useRealTimers(); });
    const turn = await startTurn(async function* (provider) {
      vi.advanceTimersByTime(59_950);
      await askPermission(provider.tools);
      while (!provider.aborted) await tick(5);
    }, { turnTimeoutMs: 60_000 });
    const toolCallId = String(payloadOf(await turn.message('tool_call')).toolCallId);
    turn.send('tool_result', { toolCallId, ok: true, result: { allowed: true } });

    expect(payloadOf(await turn.message('assistant_done'))).toMatchObject({ stopReason: 'timeout' });
  });
});

describe('turn budget', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const source = (wait: AuthorWait) => ({ isAwaitingAuthor: () => wait.waiting, watchAuthorWait: (listener: (waiting: boolean) => void) => wait.watch(listener) });

  it('is spent after its time when nothing waits', () => {
    const spent = vi.fn();
    startTurnBudget(100, spent);

    vi.advanceTimersByTime(99);
    expect(spent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spent).toHaveBeenCalledOnce();
  });

  it('stands still through a wait and then runs out what was left', () => {
    const spent = vi.fn();
    const wait = new AuthorWait();
    startTurnBudget(100, spent, source(wait));

    vi.advanceTimersByTime(40);
    wait.begin();
    vi.advanceTimersByTime(10_000);
    expect(spent).not.toHaveBeenCalled();
    wait.end();
    vi.advanceTimersByTime(59);
    expect(spent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spent).toHaveBeenCalledOnce();
  });

  it('stays stopped until the last of several waits is over', () => {
    const spent = vi.fn();
    const wait = new AuthorWait();
    startTurnBudget(100, spent, source(wait));

    wait.begin();
    wait.begin();
    wait.end();
    vi.advanceTimersByTime(1_000);
    expect(spent).not.toHaveBeenCalled();
    wait.end();
    vi.advanceTimersByTime(100);
    expect(spent).toHaveBeenCalledOnce();
  });

  it('starts stopped when it begins in the middle of a wait', () => {
    const spent = vi.fn();
    const wait = new AuthorWait();
    wait.begin();
    startTurnBudget(100, spent, source(wait));

    vi.advanceTimersByTime(1_000);
    expect(spent).not.toHaveBeenCalled();
    wait.end();
    vi.advanceTimersByTime(100);
    expect(spent).toHaveBeenCalledOnce();
  });

  it('is never spent once stopped, whatever the waits do afterwards', () => {
    const spent = vi.fn();
    const wait = new AuthorWait();
    const budget = startTurnBudget(100, spent, source(wait));

    wait.begin();
    budget.stop();
    wait.end();
    vi.advanceTimersByTime(1_000);

    expect(spent).not.toHaveBeenCalled();
  });
});

// Claude Code ends a tool call at a hard limit of its own, so that limit has
// to be longer than a card may wait.
describe('the tool-call limit handed to Claude Code', () => {
  it('outlasts a card and keeps the rest of the environment', () => {
    const env = envForAuthorWait({ PATH: '/bin', ANTHROPIC_API_KEY: 'k' }, AUTHOR_WAIT_TTL_MS);

    expect(env).toMatchObject({ PATH: '/bin', ANTHROPIC_API_KEY: 'k' });
    expect(Number(env.MCP_TOOL_TIMEOUT)).toBeGreaterThan(AUTHOR_WAIT_TTL_MS + 5_000);
  });

  it('raises a limit set too low and leaves a longer one alone', () => {
    expect(Number(envForAuthorWait({ MCP_TOOL_TIMEOUT: '30000' }, AUTHOR_WAIT_TTL_MS).MCP_TOOL_TIMEOUT)).toBeGreaterThan(AUTHOR_WAIT_TTL_MS);
    expect(envForAuthorWait({ MCP_TOOL_TIMEOUT: '7200000' }, AUTHOR_WAIT_TTL_MS).MCP_TOOL_TIMEOUT).toBe('7200000');
    expect(Number(envForAuthorWait({ MCP_TOOL_TIMEOUT: 'soon' }, AUTHOR_WAIT_TTL_MS).MCP_TOOL_TIMEOUT)).toBeGreaterThan(AUTHOR_WAIT_TTL_MS);
  });
});
