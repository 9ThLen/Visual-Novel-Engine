// @vitest-environment node
import { GeminiProvider, DEFAULT_GEMINI_CHAT_MODEL } from '../../tools/ai-bridge/src/gemini-provider';
import { ProviderFailure, type AgentEvent, type ToolInvoker } from '../../tools/ai-bridge/src/provider';

describe('GeminiProvider', () => {
  const dummyBridge: ToolInvoker = {
    async call(toolName: string, input: unknown) {
      if (toolName === 'get_story_overview') {
        return { title: 'Test Story', summary: 'A mystery visual novel' };
      }
      return { ok: true };
    },
  };

  it('uses default model gemini-2.5-flash when unspecified', () => {
    const provider = new GeminiProvider(dummyBridge, undefined, { apiKey: 'test-key' });
    expect(provider).toBeDefined();
  });

  it('accepts only attachment formats supported by the bridge transport', () => {
    const provider = new GeminiProvider(dummyBridge, undefined, { apiKey: 'test-key' });
    expect(provider.supportsAttachments([
      { id: 'a', name: 'image.webp', kind: 'image', mimeType: 'image/webp', bytes: new Uint8Array([1]) },
    ])).toBe(true);
    expect(provider.supportsAttachments([
      { id: 'a', name: 'empty.webp', kind: 'image', mimeType: 'image/webp', bytes: new Uint8Array() },
    ])).toBe(false);
  });

  it('streams text chunks from Gemini SSE response', async () => {
    const sseResponseData = [
      'data: ' + JSON.stringify({
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: 'Hello ' }],
          },
        }],
      }),
      'data: ' + JSON.stringify({
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: 'from Gemini!' }],
          },
        }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
      'data: [DONE]',
    ].join('\n\n');

    const mockFetch = vi.fn().mockResolvedValue(new Response(sseResponseData, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }));

    const provider = new GeminiProvider(dummyBridge, undefined, {
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const events: any[] = [];
    for await (const event of provider.send({ text: 'Hi', attachments: [] })) {
      events.push(event);
    }

    expect(events.filter(event => event.type !== 'activity')).toEqual([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'from Gemini!' },
      {
        type: 'done',
        stopReason: 'end_turn',
        diagnostics: expect.objectContaining({
          model: DEFAULT_GEMINI_CHAT_MODEL,
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        }),
      },
    ]);
  });

  it('handles tool calls in stream and continues to next round', async () => {
    const round1Response = 'data: ' + JSON.stringify({
      candidates: [{
        content: {
          role: 'model',
          parts: [{
            functionCall: {
              name: 'get_story_overview',
              args: {},
            },
          }],
        },
      }],
    }) + '\n\n';

    const round2Response = 'data: ' + JSON.stringify({
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Overview retrieved.' }],
        },
      }],
    }) + '\n\n';

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(round1Response, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
      .mockResolvedValueOnce(new Response(round2Response, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));

    const provider = new GeminiProvider(dummyBridge, undefined, {
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const events: any[] = [];
    for await (const event of provider.send({ text: 'What is the story overview?', attachments: [] })) {
      events.push(event);
    }

    expect(events.filter(event => event.type !== 'activity')).toEqual([
      { type: 'text', text: 'Overview retrieved.' },
      {
        type: 'done',
        stopReason: 'end_turn',
        diagnostics: expect.any(Object),
      },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws ProviderFailure GEMINI_API_AUTH_FAILED on 401 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    const provider = new GeminiProvider(dummyBridge, undefined, {
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(async () => {
      for await (const _ of provider.send({ text: 'Hi', attachments: [] })) {}
    }).rejects.toThrow(ProviderFailure);
  });

  it('imports a provider-neutral transcript including completed tools', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const mockFetch = vi.fn(async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'next' }] } }] })}\n\n`, { status: 200 });
    });
    const provider = new GeminiProvider(dummyBridge, undefined, { apiKey: 'test-key', fetch: mockFetch as typeof fetch });
    provider.replaceConversation([
      { type: 'user', input: { text: 'first', attachments: [] } },
      { type: 'assistant_text', text: 'checking' },
      { type: 'tool', id: 'portable_1', name: 'get_story_overview', input: {}, result: { title: 'Story' } },
    ]);
    for await (const _event of provider.send({ text: 'next', attachments: [] })) { /* consume */ }
    const contents = requestBody?.contents as Array<{ role: string; parts: Array<Record<string, unknown>> }>;
    expect(contents[0]).toMatchObject({ role: 'user', parts: [{ text: 'first' }] });
    expect(contents.some(content => content.parts.some(part => 'functionCall' in part))).toBe(true);
    expect(contents.some(content => content.parts.some(part => 'functionResponse' in part))).toBe(true);
  });

  it.each([429, 500, 502, 503, 504])('retries HTTP %s before streaming', async status => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status }))
      .mockResolvedValueOnce(new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })}\n\n`, { status: 200 }));
    const provider = new GeminiProvider(dummyBridge, undefined, {
      apiKey: 'test-key', fetch: mockFetch, retry: { baseDelayMs: 0 },
    });
    const events = [];
    for await (const event of provider.send({ text: 'Hi', attachments: [] })) events.push(event);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'text', text: 'ok' });
  });

  it('retries a network error before streaming', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })}\n\n`, { status: 200 }));
    const provider = new GeminiProvider(dummyBridge, undefined, {
      apiKey: 'test-key', fetch: mockFetch, retry: { baseDelayMs: 0 },
    });
    for await (const _event of provider.send({ text: 'Hi', attachments: [] })) { /* consume */ }
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a provider-owned timeout', async () => {
    const mockFetch = vi.fn(async (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    const provider = new GeminiProvider(dummyBridge, undefined, {
      apiKey: 'test-key', fetch: mockFetch as typeof fetch, turnTimeoutMs: 10, retry: { baseDelayMs: 0 },
    });
    await expect(async () => {
      for await (const _event of provider.send({ text: 'Hi', attachments: [] })) { /* consume */ }
    }).rejects.toThrow('GEMINI_API_TIMEOUT');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('never retries a later request after a tool call has started', async () => {
    const toolResponse = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'get_story_overview', args: {} } }] } }] })}\n\n`;
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(toolResponse, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    const provider = new GeminiProvider(dummyBridge, undefined, {
      apiKey: 'test-key', fetch: mockFetch, retry: { baseDelayMs: 0 },
    });
    await expect(async () => {
      for await (const _event of provider.send({ text: 'Hi', attachments: [] })) { /* consume */ }
    }).rejects.toThrow('GEMINI_API_FAILED');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('never retries after receiving a text fragment', async () => {
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pullCount++ === 0) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'partial' }] } }] })}\n\n`));
        } else {
          controller.error(new TypeError('stream disconnected'));
        }
      },
    });
    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    const provider = new GeminiProvider(dummyBridge, undefined, {
      apiKey: 'test-key', fetch: mockFetch, retry: { baseDelayMs: 0 },
    });
    const received: AgentEvent[] = [];
    await expect(async () => {
      for await (const event of provider.send({ text: 'Hi', attachments: [] })) received.push(event);
    }).rejects.toThrow('GEMINI_API_FAILED');
    expect(received).toContainEqual({ type: 'text', text: 'partial' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
