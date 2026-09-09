// @vitest-environment node
import {
  type AgentEvent,
  type AgentProvider,
  type AgentUserInput,
  type PortableTranscriptEntry,
  ProviderFailure,
  type ToolInvoker,
} from '../../tools/ai-bridge/src/provider';
import { RoutingProvider } from '../../tools/ai-bridge/src/routing-provider';

type Behavior = (tools: ToolInvoker, input: AgentUserInput) => AsyncIterable<AgentEvent>;

class FakeProvider implements AgentProvider {
  imported: readonly PortableTranscriptEntry[] | undefined;
  inputs: AgentUserInput[] = [];
  aborted = false;
  resets = 0;

  constructor(private readonly tools: ToolInvoker, private readonly behavior: Behavior, private readonly attachments = true) {}
  send(input: AgentUserInput): AsyncIterable<AgentEvent> {
    this.inputs.push(input);
    return this.behavior(this.tools, input);
  }
  abort(): void { this.aborted = true; }
  resetConversation(): void { this.resets += 1; }
  replaceConversation(transcript: readonly PortableTranscriptEntry[]): void { this.imported = [...transcript]; }
  supportsAttachments(): boolean { return this.attachments; }
}

async function* events(...items: AgentEvent[]): AsyncIterable<AgentEvent> {
  yield* items;
}

async function* failure(reason: ConstructorParameters<typeof ProviderFailure>[0]): AsyncIterable<AgentEvent> {
  throw new ProviderFailure(reason);
}

async function consume(provider: AgentProvider, text = 'hello', attachments: AgentUserInput['attachments'] = []): Promise<AgentEvent[]> {
  const output: AgentEvent[] = [];
  for await (const event of provider.send({ text, attachments })) output.push(event);
  return output;
}

function setup(primaryBehavior: Behavior, fallbackBehavior: Behavior, fallbackAttachments = true) {
  const bridge: ToolInvoker = { call: vi.fn(async () => ({ sceneId: 'scene-1' })) };
  let primary!: FakeProvider;
  let fallback!: FakeProvider;
  const router = new RoutingProvider({
    bridge,
    primary: tools => primary = new FakeProvider(tools, primaryBehavior),
    fallback: tools => fallback = new FakeProvider(tools, fallbackBehavior, fallbackAttachments),
  });
  return { router, bridge, get primary() { return primary; }, get fallback() { return fallback; } };
}

describe('RoutingProvider', () => {
  it('falls back on an eligible primary failure before output', async () => {
    const state = setup(
      () => failure('OPENAI_API_FAILED'),
      () => events({ type: 'text', text: 'Gemini' }, { type: 'done' }),
    );
    expect(await consume(state.router)).toEqual([{ type: 'text', text: 'Gemini' }, { type: 'done' }]);
    expect(state.fallback.imported).toEqual([]);
  });

  it('moves prior text and completed tool results through the portable transcript', async () => {
    let primaryTurn = 0;
    const state = setup(
      tools => (async function* () {
        primaryTurn += 1;
        if (primaryTurn === 2) throw new ProviderFailure('OPENAI_API_FAILED');
        yield { type: 'activity', kind: 'tool_call' } as const;
        await tools.call('get_scene', { sceneId: 'scene-1' });
        yield { type: 'text', text: 'Primary answer' } as const;
        yield { type: 'done' } as const;
      })(),
      () => events({ type: 'text', text: 'Fallback answer' }, { type: 'done' }),
    );

    await consume(state.router, 'first');
    await consume(state.router, 'second');
    expect(state.fallback.imported).toEqual([
      { type: 'user', input: { text: 'first', attachments: [] } },
      { type: 'tool', id: 'portable_tool_1', name: 'get_scene', input: { sceneId: 'scene-1' }, result: { sceneId: 'scene-1' } },
      { type: 'assistant_text', text: 'Primary answer' },
    ]);
  });

  it('never falls back after partial text', async () => {
    const state = setup(
      () => (async function* () {
        yield { type: 'text', text: 'partial' } as const;
        throw new ProviderFailure('OPENAI_API_FAILED');
      })(),
      () => events({ type: 'text', text: 'unsafe duplicate' }, { type: 'done' }),
    );
    const received: AgentEvent[] = [];
    await expect(async () => {
      for await (const event of state.router.send({ text: 'hello', attachments: [] })) received.push(event);
    }).rejects.toThrow('OPENAI_API_FAILED');
    expect(received).toEqual([{ type: 'text', text: 'partial' }]);
    expect(state.fallback.inputs).toHaveLength(0);
  });

  it('never falls back after a tool call is announced', async () => {
    const state = setup(
      () => (async function* () {
        yield { type: 'activity', kind: 'tool_call' } as const;
        throw new ProviderFailure('OPENAI_API_FAILED');
      })(),
      () => events({ type: 'done' }),
    );
    await expect(consume(state.router)).rejects.toThrow('OPENAI_API_FAILED');
    expect(state.fallback.inputs).toHaveLength(0);
  });

  it('does not transfer attachments to a fallback that cannot accept them', async () => {
    const state = setup(() => failure('OPENAI_RATE_LIMITED'), () => events({ type: 'done' }), false);
    const attachment = { id: 'a', name: 'a.txt', kind: 'text' as const, mimeType: 'text/plain', bytes: new Uint8Array([1]) };
    await expect(consume(state.router, 'inspect', [attachment])).rejects.toThrow('OPENAI_RATE_LIMITED');
    expect(state.fallback.inputs).toHaveLength(0);
  });

  it('stays on the fallback after switching so histories cannot diverge', async () => {
    const state = setup(
      () => failure('OPENAI_RATE_LIMITED'),
      (_tools, input) => events({ type: 'text', text: input.text }, { type: 'done' }),
    );
    await consume(state.router, 'one');
    await consume(state.router, 'two');
    expect(state.primary.inputs).toHaveLength(1);
    expect(state.fallback.inputs.map(input => input.text)).toEqual(['one', 'two']);
  });

  it('does not permanently switch providers after a primary timeout', async () => {
    const state = setup(
      () => failure('OPENAI_API_TIMEOUT'),
      () => events({ type: 'text', text: 'unexpected fallback' }, { type: 'done' }),
    );
    await expect(consume(state.router)).rejects.toThrow('OPENAI_API_TIMEOUT');
    expect(state.fallback.inputs).toHaveLength(0);
  });

  it('aborts the active fallback between turns', async () => {
    const state = setup(
      () => failure('OPENAI_RATE_LIMITED'),
      () => events({ type: 'done' }),
    );
    await consume(state.router);
    state.primary.aborted = false;
    state.fallback.aborted = false;
    state.router.abort();
    expect(state.primary.aborted).toBe(false);
    expect(state.fallback.aborted).toBe(true);
  });
});
