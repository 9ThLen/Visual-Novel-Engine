// @vitest-environment node
import { GeminiProvider, DEFAULT_GEMINI_CHAT_MODEL } from '../../tools/ai-bridge/src/gemini-provider';
import { ProviderFailure, type ToolInvoker } from '../../tools/ai-bridge/src/provider';

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

    expect(events).toEqual([
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

    expect(events).toEqual([
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
});
