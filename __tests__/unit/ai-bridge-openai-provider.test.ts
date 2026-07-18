// @vitest-environment node
import { OpenAiProvider, DEFAULT_OPENAI_CHAT_MODEL } from '../../tools/ai-bridge/src/openai-provider';
import { BridgeToolError, type AgentEvent, type ToolInvoker } from '../../tools/ai-bridge/src/provider';
import { MODEL_BRIDGE_TOOLS } from '../../lib/ai/bridge-tools';

// --- SSE fixtures --------------------------------------------------------

const enc = new TextEncoder();
const frame = (event: unknown): string => `data: ${JSON.stringify(event)}\n\n`;
const delta = (text: string) => ({ type: 'response.output_text.delta', delta: text });
const message = (text: string) => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
const completed = (output: unknown[], status = 'completed') => ({ type: 'response.completed', response: { status, output } });
const incomplete = (output: unknown[] = []) => ({ type: 'response.incomplete', response: { status: 'incomplete', output } });
const failed = (code = 'server_error') => ({ type: 'response.failed', response: { status: 'failed', error: { code } } });
const functionCall = (name: string, args: unknown, callId = 'call_1') =>
  ({ type: 'function_call', name, call_id: callId, arguments: JSON.stringify(args) });

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
function rawResponse(text: string, chunk?: number): Response {
  return new Response(bodyStream(text, chunk), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
function sseResponse(events: unknown[], opts: { chunk?: number } = {}): Response {
  return rawResponse(events.map(frame).join(''), opts.chunk);
}
function errorResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response('{"error":{"message":"redact-me"}}', { status, headers });
}
/** A 200 stream that emits one delta then errors when the request signal aborts. */
function abortableResponse(signal: AbortSignal, first: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(frame(delta(first))));
      signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true });
    },
  });
  return new Response(stream, { status: 200 });
}

// --- Test doubles --------------------------------------------------------

type Responder = (body: Record<string, unknown>, init: RequestInit) => Response;
function fakeFetch(...responders: Responder[]) {
  const bodies: Array<Record<string, unknown>> = [];
  const impl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    bodies.push(body);
    return responders[Math.min(bodies.length - 1, responders.length - 1)](body, init);
  }) as unknown as typeof fetch;
  return { impl, bodies };
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
  return { provider: new OpenAiProvider(bridge, { locale: 'uk' }, { apiKey: 'sk-test', fetch: impl }), bridge };
}
async function run(provider: OpenAiProvider, text = 'hello'): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of provider.send({ text, attachments: [] })) events.push(event);
  return events;
}
const texts = (events: AgentEvent[]): string =>
  events.filter((e): e is { type: 'text'; text: string } => e.type === 'text').map(e => e.text).join('');
const asRecords = (input: unknown): Array<Record<string, unknown>> =>
  Array.isArray(input) ? input.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : [];

// --- Request contract ----------------------------------------------------

describe('OpenAiProvider request contract', () => {
  it('maps image and PDF attachments to low-detail Responses inputs', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse([delta('ok'), completed([message('ok')])]));
    const provider = makeProvider(impl).provider;
    for await (const _event of provider.send({ text: 'inspect', attachments: [
      { id: 'image', name: 'image.png', kind: 'image', mimeType: 'image/png', bytes: new Uint8Array([0x89, 0x50]) },
      { id: 'pdf', name: 'notes.pdf', kind: 'pdf', mimeType: 'application/pdf', bytes: new TextEncoder().encode('%PDF-') },
    ] })) { /* consume */ }
    const user = asRecords(bodies[0].input).find(item => item.role === 'user');
    const content = asRecords(user?.content);
    expect(content.find(item => item.type === 'input_image')).toMatchObject({ detail: 'low' });
    expect(content.find(item => item.type === 'input_file')).toMatchObject({ filename: 'notes.pdf', detail: 'low' });
    expect(String(content.find(item => item.type === 'input_file')?.file_data)).toContain('data:application/pdf;base64,');
  });
  it('sends a store:false streaming request exposing only model tools', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse([delta('hi'), completed([message('hi')])]));
    await run(makeProvider(impl).provider);

    const body = bodies[0];
    expect(body.model).toBe(DEFAULT_OPENAI_CHAT_MODEL);
    expect(body.store).toBe(false);
    expect(body.stream).toBe(true);
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.max_output_tokens).toBe(8192);
    expect(typeof body.instructions).toBe('string');
    expect(String(body.instructions)).toContain('UI locale hint: uk');

    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools.map(t => t.name)).toEqual(MODEL_BRIDGE_TOOLS.map(t => t.name));
    expect(tools.every(t => t.type === 'function' && t.strict === false)).toBe(true);
    expect(tools.map(t => t.name)).not.toContain('authorize_capability');
    expect(tools.map(t => t.name)).not.toContain('get_image_binary');
    for (const tool of tools) expect(() => JSON.stringify(tool.parameters)).not.toThrow();
  });

  it('honors the OPENAI_CHAT_MODEL override', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse([completed([message('ok')])]));
    const provider = new OpenAiProvider(new FakeBridge(), undefined, { apiKey: 'k', fetch: impl, model: 'gpt-custom' });
    await run(provider);
    expect(bodies[0].model).toBe('gpt-custom');
  });

  it('rejects an oversized request before calling the API', async () => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    await expect(run(makeProvider(fetch).provider, 'x'.repeat(1_100_000))).rejects.toThrow('OPENAI_REQUEST_TOO_LARGE');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// --- Streaming -----------------------------------------------------------

describe('OpenAiProvider streaming', () => {
  it('streams text deltas incrementally and finishes with the completed status', async () => {
    const { impl } = fakeFetch(() => sseResponse([delta('Hel'), delta('lo'), delta(' world'), completed([message('Hello world')])]));
    const events = await run(makeProvider(impl).provider);
    expect(events.filter(e => e.type === 'text')).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'text', text: ' world' },
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'completed' });
  });

  it('reconstructs text across fragmented, multibyte SSE chunks', async () => {
    const { impl } = fakeFetch(() => sseResponse([delta('Привіт'), delta('🎮 готово'), completed([message('x')])], { chunk: 3 }));
    const events = await run(makeProvider(impl).provider);
    expect(texts(events)).toBe('Привіт🎮 готово');
  });

  it('ignores SSE comment keepalives', async () => {
    const raw = `: keep-alive\n\n${frame(delta('ok'))}: ping\n\n${frame(completed([message('ok')]))}`;
    const { impl } = fakeFetch(() => rawResponse(raw));
    const events = await run(makeProvider(impl).provider);
    expect(texts(events)).toBe('ok');
  });

  it('does not double-emit the final message text', async () => {
    const { impl } = fakeFetch(() => sseResponse([delta('once'), completed([message('once')])]));
    const events = await run(makeProvider(impl).provider);
    expect(texts(events)).toBe('once');
  });

  it('uses terminal text as a safe fallback when no deltas arrive', async () => {
    const { impl } = fakeFetch(() => sseResponse([completed([message('fallback')])]));
    expect(texts(await run(makeProvider(impl).provider))).toBe('fallback');
  });

  it('returns only allowlisted response diagnostics', async () => {
    const terminal = {
      type: 'response.completed',
      response: {
        id: 'resp_safe', model: 'gpt-safe', status: 'completed', output: [message('ok')],
        usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5, secret: 'do-not-forward' },
      },
    };
    const { impl } = fakeFetch(() => sseResponse([terminal]));
    const done = (await run(makeProvider(impl).provider)).at(-1);
    expect(done).toMatchObject({ diagnostics: { requestId: 'resp_safe', model: 'gpt-safe', inputTokens: 3, outputTokens: 2, totalTokens: 5 } });
    expect(JSON.stringify(done)).not.toContain('secret');
  });

  it('returns refusal text with a refusal stop reason', async () => {
    const refusal = { type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'I cannot help.' }] };
    const { impl } = fakeFetch(() => sseResponse([completed([refusal])]));
    const events = await run(makeProvider(impl).provider);
    expect(texts(events)).toBe('I cannot help.');
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'refusal' });
  });
});

// --- Tool loop -----------------------------------------------------------

describe('OpenAiProvider tool loop', () => {
  it('runs a tool call then continues to a final response', async () => {
    const bridge = new FakeBridge(async () => ({ sceneId: 'scene-1', title: 'Intro' }));
    const { impl, bodies } = fakeFetch(
      () => sseResponse([completed([functionCall('get_scene', { sceneId: 'scene-1' })])]),
      () => sseResponse([delta('done'), completed([message('done')])]),
    );
    const events = await run(new OpenAiProvider(bridge, undefined, { apiKey: 'k', fetch: impl }));

    expect(bridge.calls).toEqual([{ name: 'get_scene', input: { sceneId: 'scene-1' } }]);
    const secondInput = asRecords(bodies[1].input);
    const output = secondInput.find(i => i.type === 'function_call_output');
    expect(output).toMatchObject({ call_id: 'call_1', output: JSON.stringify({ sceneId: 'scene-1', title: 'Intro' }) });
    expect(texts(events)).toBe('done');
  });

  it('feeds a structured error back to the model when a tool rejects, then continues', async () => {
    const bridge = new FakeBridge(async () => { throw new BridgeToolError('VALIDATION_FAILED', 'bad input'); });
    const { impl, bodies } = fakeFetch(
      () => sseResponse([completed([functionCall('get_scene', { sceneId: '' })])]),
      () => sseResponse([delta('recovered'), completed([message('recovered')])]),
    );
    const events = await run(new OpenAiProvider(bridge, undefined, { apiKey: 'k', fetch: impl }));

    const output = asRecords(bodies[1].input).find(i => i.type === 'function_call_output');
    expect(JSON.parse(String(output?.output))).toMatchObject({ errorCode: 'VALIDATION_FAILED' });
    expect(texts(events)).toBe('recovered');
  });

  it('JSON-encodes a normal tool result and caps an oversized one', async () => {
    const bridge = new FakeBridge(async () => ({ blob: 'x'.repeat(300_000) }));
    const { impl, bodies } = fakeFetch(
      () => sseResponse([completed([functionCall('list_scenes', {})])]),
      () => sseResponse([completed([message('ok')])]),
    );
    await run(new OpenAiProvider(bridge, undefined, { apiKey: 'k', fetch: impl }));
    const output = asRecords(bodies[1].input).find(i => i.type === 'function_call_output');
    expect(JSON.parse(String(output?.output))).toEqual({
      errorCode: 'VALIDATION_FAILED',
      errorMessage: 'Tool output exceeds the provider limit',
    });
  });

  it('drives generate_image like any model tool and continues the turn', async () => {
    const bridge = new FakeBridge(async () => ({ requestId: 'img-1', status: 'ok' }));
    const { impl } = fakeFetch(
      () => sseResponse([completed([functionCall('generate_image', { prompt: 'a cat', purpose: 'background' })])]),
      () => sseResponse([delta('added'), completed([message('added')])]),
    );
    const events = await run(new OpenAiProvider(bridge, undefined, { apiKey: 'k', fetch: impl }));
    expect(bridge.calls[0]?.name).toBe('generate_image');
    expect(texts(events)).toBe('added');
  });

  it('rejects a response with more than one function call', async () => {
    const { impl } = fakeFetch(() => sseResponse([completed([
      functionCall('get_scene', { sceneId: 'a' }, 'c1'),
      functionCall('list_scenes', {}, 'c2'),
    ])]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('OPENAI_PARALLEL_TOOL_CALLS');
  });

  it('stops after the maximum number of tool rounds', async () => {
    const bridge = new FakeBridge(async () => ({ ok: true }));
    const { impl } = fakeFetch(() => sseResponse([completed([functionCall('list_scenes', {}, 'loop')])]));
    await expect(run(new OpenAiProvider(bridge, undefined, { apiKey: 'k', fetch: impl }))).rejects.toThrow('OPENAI_ROUND_LIMIT');
    expect(bridge.calls.length).toBe(12);
  });
});

// --- History -------------------------------------------------------------

describe('OpenAiProvider history', () => {
  it('carries committed history into the next turn', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse([completed([message('a')])]));
    const { provider } = makeProvider(impl);
    await run(provider, 'first');
    await run(provider, 'second');
    const secondInput = asRecords(bodies[1].input);
    expect(secondInput.filter(i => i.role === 'user').map(i => i.content)).toEqual(['first', 'second']);
    expect(secondInput.some(i => i.type === 'message' && i.role === 'assistant')).toBe(true);
  });

  it('resetConversation drops prior history', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse([completed([message('a')])]));
    const { provider } = makeProvider(impl);
    await run(provider, 'first');
    provider.resetConversation();
    await run(provider, 'second');
    const secondInput = asRecords(bodies[1].input);
    expect(secondInput.filter(i => i.role === 'user').map(i => i.content)).toEqual(['second']);
  });

  it('blocks the next turn after the configured session token budget and reset clears it', async () => {
    const terminal = { type: 'response.completed', response: { status: 'completed', output: [message('ok')], usage: { total_tokens: 5 } } };
    const { impl, bodies } = fakeFetch(() => sseResponse([terminal]));
    const provider = new OpenAiProvider(new FakeBridge(), undefined, { apiKey: 'k', fetch: impl, sessionTokenBudget: 5 });
    await run(provider, 'first');
    await expect(run(provider, 'second')).rejects.toThrow('OPENAI_SESSION_BUDGET_EXHAUSTED');
    expect(bodies).toHaveLength(1);
    provider.resetConversation();
    await run(provider, 'third');
    expect(bodies).toHaveLength(2);
  });

  it('preserves encrypted reasoning items across a tool round', async () => {
    const reasoning = { type: 'reasoning', encrypted_content: 'enc-abc', summary: [] };
    const bridge = new FakeBridge(async () => ({ scenes: [] }));
    const { impl, bodies } = fakeFetch(
      () => sseResponse([completed([reasoning, functionCall('list_scenes', {})])]),
      () => sseResponse([completed([message('ok')])]),
    );
    await run(new OpenAiProvider(bridge, undefined, { apiKey: 'k', fetch: impl }));
    expect(asRecords(bodies[1].input).some(i => i.type === 'reasoning' && i.encrypted_content === 'enc-abc')).toBe(true);
  });

  it('fails atomically and leaves history unchanged when reasoning lacks encrypted content', async () => {
    const { impl, bodies } = fakeFetch(
      () => sseResponse([completed([message('a')])]),
      () => sseResponse([completed([{ type: 'reasoning', summary: [] }, message('b')])]),
      () => sseResponse([completed([message('c')])]),
    );
    const { provider } = makeProvider(impl);
    await run(provider, 'first');
    await expect(run(provider, 'second')).rejects.toThrow('OPENAI_NON_REPLAYABLE_REASONING');
    await run(provider, 'third');
    const thirdInput = asRecords(bodies[2].input);
    expect(thirdInput.filter(i => i.role === 'user').map(i => i.content)).toEqual(['first', 'third']);
  });
});

// --- Errors, retries, abort ---------------------------------------------

describe('OpenAiProvider failure handling', () => {
  it('maps a persistent 401 without retrying', async () => {
    const { impl, bodies } = fakeFetch(() => errorResponse(401));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('OPENAI_API_AUTH_FAILED');
    expect(bodies.length).toBe(1);
  });

  it('maps a 404 to an unavailable model', async () => {
    const { impl } = fakeFetch(() => errorResponse(404));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('OPENAI_MODEL_UNAVAILABLE');
  });

  it('retries once on 500 then succeeds', async () => {
    const { impl, bodies } = fakeFetch(
      () => errorResponse(500, { 'retry-after': '0.001' }),
      () => sseResponse([delta('ok'), completed([message('ok')])]),
    );
    const events = await run(makeProvider(impl).provider);
    expect(bodies.length).toBe(2);
    expect(texts(events)).toBe('ok');
  });

  it('gives up after one retry on a persistent 503', async () => {
    const { impl, bodies } = fakeFetch(() => errorResponse(503, { 'retry-after': '0.001' }));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('OPENAI_API_FAILED');
    expect(bodies.length).toBe(2);
  });

  it('maps a persistent 429 to a rate-limit reason', async () => {
    const { impl, bodies } = fakeFetch(() => errorResponse(429, { 'retry-after': '0.001' }));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('OPENAI_RATE_LIMITED');
    expect(bodies.length).toBe(2);
  });

  it('throws on a stream failure event and never replays a partial stream', async () => {
    const { impl, bodies } = fakeFetch(() => sseResponse([delta('x'), failed('server_error')]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow(/OPENAI_API_FAILED/);
    expect(bodies.length).toBe(1);
  });

  it('throws when the stream ends before completion', async () => {
    const { impl } = fakeFetch(() => sseResponse([delta('x')]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('OPENAI_STREAM_INCOMPLETE');
  });

  it('returns partial text with an incomplete stop reason', async () => {
    const { impl } = fakeFetch(() => sseResponse([delta('partial'), incomplete([message('partial')])]));
    const events = await run(makeProvider(impl).provider);
    expect(texts(events)).toBe('partial');
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'incomplete' });
  });

  it('rejects an incomplete response without usable text', async () => {
    const { impl } = fakeFetch(() => sseResponse([incomplete([])]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('OPENAI_RESPONSE_INCOMPLETE');
  });

  it('rejects a terminal response without an output array', async () => {
    const { impl } = fakeFetch(() => sseResponse([{ type: 'response.completed', response: { status: 'completed' } }]));
    await expect(run(makeProvider(impl).provider)).rejects.toThrow('OPENAI_MALFORMED_RESPONSE');
  });

  it('does not leak the error body in a stream failure', async () => {
    const { impl } = fakeFetch(() => sseResponse([failed('server_error')]));
    await run(makeProvider(impl).provider).catch((error: unknown) => {
      expect(String(error)).toContain('OPENAI_API_FAILED');
      expect(String(error)).not.toContain('redact-me');
    });
  });

  it('releases the response stream when the consumer breaks out mid-turn', async () => {
    // The bridge server breaks out of `send` on interrupt; the underlying
    // response reader must still be released rather than left dangling.
    let released = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(enc.encode(frame(delta('partial')))); },
      cancel() { released = true; },
    });
    const impl = (async () => new Response(stream, { status: 200 })) as unknown as typeof fetch;
    const provider = new OpenAiProvider(new FakeBridge(), undefined, { apiKey: 'k', fetch: impl });

    for await (const event of provider.send({ text: 'x', attachments: [] })) {
      if (event.type === 'text') break;
    }
    expect(released).toBe(true);
  });

  it('aborts an in-flight stream and stops yielding', async () => {
    const { impl } = fakeFetch((_body, init) => abortableResponse(init.signal!, 'Hi'));
    const { provider } = makeProvider(impl);
    const events: AgentEvent[] = [];
    const pending = (async () => { for await (const event of provider.send({ text: 'x', attachments: [] })) events.push(event); })();
    await new Promise(resolve => setTimeout(resolve, 20));
    provider.abort();
    await expect(pending).rejects.toThrow();
    expect(events).toEqual([{ type: 'text', text: 'Hi' }]);
  });

  it('maps the provider-owned turn deadline to a timeout reason', async () => {
    const impl = (async (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })) as unknown as typeof fetch;
    const provider = new OpenAiProvider(new FakeBridge(), undefined, { apiKey: 'k', fetch: impl, turnTimeoutMs: 10 });
    await expect(run(provider)).rejects.toThrow('OPENAI_API_TIMEOUT');
  });

  it('stops immediately while an app tool promise is still pending', async () => {
    const bridge = new FakeBridge(() => new Promise(() => {}));
    const { impl } = fakeFetch(() => sseResponse([completed([functionCall('list_scenes', {})])]));
    const provider = new OpenAiProvider(bridge, undefined, { apiKey: 'k', fetch: impl });
    const pending = run(provider);
    await new Promise(resolve => setTimeout(resolve, 10));
    provider.abort();
    await expect(Promise.race([
      pending,
      new Promise((_, reject) => setTimeout(() => reject(new Error('stop timed out')), 100)),
    ])).rejects.toMatchObject({ name: 'AbortError' });
  });
});
