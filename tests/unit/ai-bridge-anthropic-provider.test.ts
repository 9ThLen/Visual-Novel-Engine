// @vitest-environment node
import { AnthropicProvider, DEFAULT_ANTHROPIC_CHAT_MODEL } from '../../tools/ai-bridge/src/anthropic-provider';
import { BridgeToolError, type AgentEvent, type ToolInvoker } from '../../tools/ai-bridge/src/provider';
import { MODEL_BRIDGE_TOOLS } from '../../src/lib/ai/bridge-tools';

// --- SSE fixtures --------------------------------------------------------

const enc = new TextEncoder();
/** The API sends both lines; the provider reads the payload and ignores `event:`. */
const frame = (event: Record<string, unknown>): string =>
  `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;

const messageStart = (usage: Record<string, unknown> = { input_tokens: 11 }) => ({
  type: 'message_start',
  message: { id: 'msg_1', type: 'message', role: 'assistant', model: DEFAULT_ANTHROPIC_CHAT_MODEL, content: [], usage },
});
const blockStart = (index: number, block: Record<string, unknown>) =>
  ({ type: 'content_block_start', index, content_block: block });
const textDelta = (index: number, text: string) =>
  ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } });
const thinkingDelta = (index: number, thinking: string) =>
  ({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking } });
const signatureDelta = (index: number, signature: string) =>
  ({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } });
const jsonDelta = (index: number, partial_json: string) =>
  ({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json } });
const blockStop = (index: number) => ({ type: 'content_block_stop', index });
const messageDelta = (stop_reason: string, output_tokens = 7) =>
  ({ type: 'message_delta', delta: { stop_reason, stop_sequence: null }, usage: { output_tokens } });
const messageStop = () => ({ type: 'message_stop' });

/** The everyday shape: some text, then a clean stop. */
function textTurn(text: string, stopReason = 'end_turn'): Record<string, unknown>[] {
  return [
    messageStart(),
    blockStart(0, { type: 'text', text: '' }),
    textDelta(0, text),
    blockStop(0),
    messageDelta(stopReason),
    messageStop(),
  ];
}

/** One tool call, with its arguments arriving split across deltas. */
function toolTurn(name: string, args: unknown, id = 'toolu_1'): Record<string, unknown>[] {
  const encoded = JSON.stringify(args);
  const cut = Math.floor(encoded.length / 2);
  return [
    messageStart(),
    blockStart(0, { type: 'tool_use', id, name, input: {} }),
    jsonDelta(0, encoded.slice(0, cut)),
    jsonDelta(0, encoded.slice(cut)),
    blockStop(0),
    messageDelta('tool_use'),
    messageStop(),
  ];
}

function bodyStream(text: string, chunk?: number): ReadableStream<Uint8Array> {
  const bytes = enc.encode(text);
  const size = chunk && chunk > 0 ? chunk : Math.max(bytes.length, 1);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.subarray(offset, offset + size));
      offset += size;
    },
  });
}
function sseResponse(events: Record<string, unknown>[], opts: { chunk?: number } = {}): Response {
  return new Response(bodyStream(events.map(frame).join(''), opts.chunk), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}
function errorResponse(status: number): Response {
  return new Response('{"type":"error","error":{"message":"redact-me"}}', { status });
}

// --- Test doubles --------------------------------------------------------

type Responder = (body: Record<string, unknown>, init: RequestInit) => Response;
function fakeFetch(...responders: Responder[]) {
  const bodies: Array<Record<string, unknown>> = [];
  const inits: RequestInit[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    inits.push(init);
    return responders[Math.min(bodies.length - 1, responders.length - 1)](bodies.at(-1)!, init);
  }) as unknown as typeof fetch;
  return { impl, bodies, inits };
}

class FakeBridge implements ToolInvoker {
  calls: Array<{ name: string; input: unknown }> = [];
  constructor(private readonly impl: (name: string, input: unknown) => Promise<unknown> = async () => ({ ok: true })) {}
  call(name: string, input: unknown): Promise<unknown> {
    this.calls.push({ name, input });
    return this.impl(name, input);
  }
}

function makeProvider(impl: typeof fetch, bridge = new FakeBridge()) {
  return { provider: new AnthropicProvider(bridge, { locale: 'uk' }, { apiKey: 'sk-ant-test', fetch: impl }), bridge };
}
async function run(provider: AnthropicProvider, text = 'hello'): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of provider.send({ text, attachments: [] })) events.push(event);
  return events;
}
const texts = (events: AgentEvent[]): string =>
  events.filter((e): e is { type: 'text'; text: string } => e.type === 'text').map(e => e.text).join('');
const asRecords = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : [];

// --- Request contract ----------------------------------------------------

describe('AnthropicProvider request contract', () => {
  it('authenticates with a key header and pins the API version', async () => {
    const { impl, inits } = fakeFetch(() => sseResponse(textTurn('hi')));
    await run(makeProvider(impl).provider);
    const headers = inits[0].headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    // The key is a header, never a query parameter: a URL is logged by things a
    // header is not.
    expect(headers.Authorization).toBeUndefined();
  });

  it('sends the bridge tool surface and asks for one action at a time', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse(textTurn('hi')));
    await run(makeProvider(impl).provider);
    expect(bodies[0].model).toBe(DEFAULT_ANTHROPIC_CHAT_MODEL);
    expect(bodies[0].stream).toBe(true);
    expect(bodies[0].tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(asRecords(bodies[0].tools).map(tool => tool.name)).toEqual(MODEL_BRIDGE_TOOLS.map(tool => tool.name));
    expect(asRecords(bodies[0].tools).every(tool => typeof tool.input_schema === 'object')).toBe(true);
    expect(String(bodies[0].system)).toContain('uk');
  });

  it('accepts only attachment formats supported by the bridge transport', () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(provider.supportsAttachments([
      { id: 'a', name: 'note.txt', kind: 'text', mimeType: 'text/plain', bytes: new Uint8Array([1]) },
    ])).toBe(true);
    expect(provider.supportsAttachments([
      { id: 'a', name: 'animation.gif', kind: 'image', mimeType: 'image/gif', bytes: new Uint8Array([1]) },
    ])).toBe(false);
  });

  it('sends each attachment kind in the block type this API takes for it', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse(textTurn('ok')));
    const { provider } = makeProvider(impl);
    const events: AgentEvent[] = [];
    for await (const event of provider.send({
      text: 'look',
      attachments: [
        { id: '1', name: 'bg.png', kind: 'image', mimeType: 'image/png', bytes: new Uint8Array([1, 2]) },
        { id: '2', name: 'brief.pdf', kind: 'pdf', mimeType: 'application/pdf', bytes: new Uint8Array([3]) },
        { id: '3', name: 'notes.txt', kind: 'text', mimeType: 'text/plain', bytes: enc.encode('plot') },
      ],
    })) events.push(event);

    const content = asRecords(asRecords(bodies[0].messages)[0].content);
    expect(content.map(block => block.type)).toEqual([
      'text', 'text', 'image', 'text', 'document', 'text', 'document',
    ]);
    // Text documents travel decoded, which is the form this API takes them in.
    expect((content[6].source as Record<string, unknown>).type).toBe('text');
    expect((content[6].source as Record<string, unknown>).data).toBe('plot');
    expect(content.filter(block => block.type === 'text').every(block => typeof block.text === 'string')).toBe(true);
    // Every attachment is announced as data, not as instructions.
    expect(String(content[1].text)).toContain('Untrusted attachment');
  });
});

// --- Streaming -----------------------------------------------------------

describe('AnthropicProvider streaming', () => {
  it('streams text deltas and reports usage once the turn ends', async () => {
    const { impl } = fakeFetch(() => sseResponse([
      messageStart({ input_tokens: 11 }),
      blockStart(0, { type: 'text', text: '' }),
      textDelta(0, 'Пишемо '),
      textDelta(0, 'сцену.'),
      blockStop(0),
      messageDelta('end_turn', 7),
      messageStop(),
    ]));
    const events = await run(makeProvider(impl).provider);
    expect(texts(events)).toBe('Пишемо сцену.');
    expect(events.at(-1)).toEqual({
      type: 'done',
      stopReason: 'end_turn',
      diagnostics: expect.objectContaining({
        model: DEFAULT_ANTHROPIC_CHAT_MODEL,
        requestId: 'msg_1',
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
      }),
    });
  });

  it('reassembles events split across network chunks', async () => {
    const { impl } = fakeFetch(() => sseResponse(textTurn('split me'), { chunk: 3 }));
    expect(texts(await run(makeProvider(impl).provider))).toBe('split me');
  });

  it('keeps reasoning out of the answer but replays it verbatim on the next round', async () => {
    const { impl, bodies } = fakeFetch(
      () => sseResponse([
        messageStart(),
        blockStart(0, { type: 'thinking', thinking: '' }),
        thinkingDelta(0, 'The scene needs a background.'),
        signatureDelta(0, 'sig-abc'),
        blockStop(0),
        blockStart(1, { type: 'tool_use', id: 'toolu_1', name: 'get_story_overview', input: {} }),
        jsonDelta(1, '{}'),
        blockStop(1),
        messageDelta('tool_use'),
        messageStop(),
      ]),
      () => sseResponse(textTurn('done')),
    );
    const events = await run(makeProvider(impl).provider);

    // The reader sees the answer, never the reasoning.
    expect(texts(events)).toBe('done');
    const replayed = asRecords(asRecords(bodies[1].messages)[1].content);
    expect(replayed[0]).toEqual({ type: 'thinking', thinking: 'The scene needs a background.', signature: 'sig-abc' });
    expect(replayed[1]).toMatchObject({ type: 'tool_use', id: 'toolu_1', name: 'get_story_overview' });
  });

  it('fails a stream that ends without a stop reason', async () => {
    const { impl } = fakeFetch(() => sseResponse([
      messageStart(),
      blockStart(0, { type: 'text', text: '' }),
      textDelta(0, 'half a'),
    ]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('ANTHROPIC_STREAM_INCOMPLETE');
  });

  it('names a refusal rather than reporting an empty answer', async () => {
    const { impl } = fakeFetch(() => sseResponse([messageStart(), messageDelta('refusal', 0), messageStop()]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('ANTHROPIC_REFUSAL');
  });

  it('reports a turn cut off before any text as incomplete', async () => {
    const { impl } = fakeFetch(() => sseResponse([messageStart(), messageDelta('max_tokens', 0), messageStop()]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('ANTHROPIC_RESPONSE_INCOMPLETE');
  });

  it('maps HTTP failures to reasons the editor can explain', async () => {
    for (const [status, reason] of [
      [401, 'ANTHROPIC_API_AUTH_FAILED'],
      [403, 'ANTHROPIC_API_FORBIDDEN'],
      [404, 'ANTHROPIC_MODEL_UNAVAILABLE'],
      [400, 'ANTHROPIC_API_FAILED'],
    ] as const) {
      const { impl } = fakeFetch(() => errorResponse(status));
      await expect(run(makeProvider(impl).provider)).rejects.toThrow(reason);
    }
  });

  it('surfaces a mid-stream error event as a provider failure', async () => {
    const { impl } = fakeFetch(() => sseResponse([
      messageStart(),
      { type: 'error', error: { type: 'overloaded_error', message: 'overloaded' } },
    ]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('ANTHROPIC_API_FAILED');
  });
});

// --- Tool rounds ---------------------------------------------------------

describe('AnthropicProvider tool rounds', () => {
  it('runs an editor action and continues the turn with its result', async () => {
    const bridge = new FakeBridge(async () => ({ title: 'Test Story' }));
    const { impl, bodies } = fakeFetch(
      () => sseResponse(toolTurn('get_story_overview', { detail: 'full' })),
      () => sseResponse(textTurn('The story is called Test Story.')),
    );
    const events = await run(makeProvider(impl, bridge).provider);

    expect(bridge.calls).toEqual([{ name: 'get_story_overview', input: { detail: 'full' } }]);
    expect(events.some(event => event.type === 'activity' && event.kind === 'tool_call')).toBe(true);
    expect(texts(events)).toBe('The story is called Test Story.');

    const followUp = asRecords(bodies[1].messages);
    const result = asRecords(followUp.at(-1)!.content)[0];
    expect(result).toEqual({ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"title":"Test Story"}' });
  });

  it('returns a failed action to the model instead of ending the turn', async () => {
    const bridge = new FakeBridge(async () => { throw new BridgeToolError('PERMISSION_DENIED', 'The author declined'); });
    const { impl, bodies } = fakeFetch(
      () => sseResponse(toolTurn('propose_change_set', { summary: 'x' })),
      () => sseResponse(textTurn('Understood.')),
    );
    expect(texts(await run(makeProvider(impl, bridge).provider))).toBe('Understood.');
    const result = asRecords(asRecords(bodies[1].messages).at(-1)!.content)[0];
    expect(String(result.content)).toContain('PERMISSION_DENIED');
  });

  it('rejects tool arguments that are not valid JSON', async () => {
    const { impl } = fakeFetch(() => sseResponse([
      messageStart(),
      blockStart(0, { type: 'tool_use', id: 'toolu_1', name: 'get_story_overview', input: {} }),
      jsonDelta(0, '{"detail":'),
      blockStop(0),
      messageDelta('tool_use'),
      messageStop(),
    ]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('ANTHROPIC_MALFORMED_FUNCTION_CALL');
  });

  it('stops after the round limit rather than looping forever', async () => {
    const { impl } = fakeFetch(() => sseResponse(toolTurn('get_story_overview', {})));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('ANTHROPIC_ROUND_LIMIT');
  });
});

// --- Session state -------------------------------------------------------

describe('AnthropicProvider session state', () => {
  it('carries history between turns and drops it on reset', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse(textTurn('ok')));
    const { provider } = makeProvider(impl);
    await run(provider, 'first');
    await run(provider, 'second');
    expect(asRecords(bodies[1].messages)).toHaveLength(3);

    provider.resetConversation();
    await run(provider, 'third');
    expect(asRecords(bodies[2].messages)).toHaveLength(1);
  });

  it('restores a portable transcript as alternating turns', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse(textTurn('ok')));
    const { provider } = makeProvider(impl);
    provider.replaceConversation([
      { type: 'user', input: { text: 'Add a scene', attachments: [] } },
      { type: 'assistant_text', text: 'Looking at the story.' },
      { type: 'tool', id: 'toolu_9', name: 'get_story_overview', input: {}, result: { title: 'Test' } },
    ]);
    await run(provider, 'continue');

    const messages = asRecords(bodies[0].messages);
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'user']);
    // The assistant's text and the call it made stay in one turn, as they were.
    expect(asRecords(messages[1].content).map(block => block.type)).toEqual(['text', 'tool_use']);
    expect(asRecords(messages[2].content)[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_9' });
  });

  it('refuses a new turn once the session token budget is spent', async () => {
    const { impl } = fakeFetch(() => sseResponse(textTurn('ok')));
    const provider = new AnthropicProvider(new FakeBridge(), undefined, {
      apiKey: 'sk-ant-test',
      fetch: impl,
      sessionTokenBudget: 10,
    });
    await run(provider, 'first');
    await expect(run(provider, 'second')).rejects.toThrow('ANTHROPIC_SESSION_BUDGET_EXHAUSTED');
  });

  it('times a turn out instead of hanging on a silent connection', async () => {
    const impl = (async (_url: string, init: RequestInit) => new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener(
            'abort',
            () => controller.error(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;
    const provider = new AnthropicProvider(new FakeBridge(), undefined, {
      apiKey: 'sk-ant-test',
      fetch: impl,
      turnTimeoutMs: 20,
    });
    await expect(run(provider)).rejects.toThrow('ANTHROPIC_API_TIMEOUT');
  });
});
