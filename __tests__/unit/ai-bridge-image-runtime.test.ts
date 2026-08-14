// @vitest-environment node
import { MAX_DECODED_IMAGE_BYTES } from '../../lib/bridge-protocol';
import { createImageToolHandlers } from '../../tools/ai-bridge/src/image-tools';
import { BridgeToolError, modelToolErrorValue } from '../../tools/ai-bridge/src/provider';
import { BridgeToolRuntime } from '../../tools/ai-bridge/src/tool-runtime';

const encoded = (bytes: number) => Buffer.from(new Uint8Array(bytes).fill(1)).toString('base64');
const apiResponse = (base64 = encoded(3), ok = true, status = 200) => ({
  ok, status, json: async () => ok ? { data: [{ b64_json: base64 }] } : { error: { message: 'bad sk-secret-key' } },
}) as Response;
const geminiResponse = (base64 = encoded(3), ok = true, status = 200) => ({
  ok,
  status,
  json: async () => ok
    ? { steps: [{ type: 'model_output', content: [{ type: 'image', data: base64, mime_type: 'image/png' }] }] }
    : { error: { message: 'bad AIzaSecretGeminiKey1234567890' } },
}) as Response;

function context(callApp = vi.fn(async () => ({ allowed: true }))) {
  return { callApp, emitImage: vi.fn(() => 'result-id') };
}

describe('bridge image tools', () => {
  it('preflights before fetch, emits base64 only to the app, and returns metadata to the model', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => apiResponse());
    const handlers = createImageToolHandlers({ apiKey: 'key', fetch: fetchMock as typeof fetch });
    const ctx = context();
    const placement = { kind: 'scene_background', operation: 'insert', sceneId: 'scene-1', afterStepId: null };
    const result = await handlers.generate_image({ prompt: 'forest', purpose: 'background', placement }, ctx);
    expect(ctx.callApp).toHaveBeenCalledWith('authorize_capability', expect.objectContaining({ capability: 'image_generate', estimate: expect.objectContaining({ provider: 'OpenAI Images', model: 'gpt-image-2' }) }), 600_000);
    expect(ctx.callApp.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(ctx.emitImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'forest', mimeType: 'image/webp', base64: expect.any(String), placement, estimatedCostUsd: { min: expect.any(Number), max: expect.any(Number), currency: 'USD' } }));
    expect(result).toMatchObject({ delivered: true, sizeBytes: 3, purpose: 'background', provider: 'openai', model: 'gpt-image-2', placement, requestId: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain('AQEB');
  });

  it('passes a preflight denial through and never spends', async () => {
    const denial = new BridgeToolError('PERMISSION_DENIED', 'Declined', { reason: 'USER_DECLINED' });
    const fetchMock = vi.fn();
    const handler = createImageToolHandlers({ apiKey: 'key', fetch: fetchMock as typeof fetch }).generate_image;
    const caught = await handler({ prompt: 'x', purpose: 'other' }, context(vi.fn(async () => { throw denial; }))).catch(error => error);
    expect(modelToolErrorValue(caught)).toEqual({ errorCode: 'PERMISSION_DENIED', errorMessage: 'Declined', details: { reason: 'USER_DECLINED' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a structured missing-key error without calling fetch', async () => {
    const fetchMock = vi.fn();
    const caught = await createImageToolHandlers({ apiKey: '', fetch: fetchMock as typeof fetch }).generate_image({ prompt: 'x', purpose: 'other' }, context()).catch(error => error) as BridgeToolError;
    expect(modelToolErrorValue(caught)).toMatchObject({ errorCode: 'PROVIDER_UNAVAILABLE', details: { reason: 'IMAGE_PROVIDER_NOT_CONFIGURED' } });
    expect(String(caught.message)).toContain('OPENAI_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts provider errors and does not log prompts by default', async () => {
    const logger = vi.fn();
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => apiResponse('', false, 400));
    const handler = createImageToolHandlers({ apiKey: 'sk-secret-key', fetch: fetchMock as typeof fetch, logger }).generate_image;
    const caught = await handler({ prompt: 'private castle prompt', purpose: 'background' }, context()).catch(error => error) as BridgeToolError;
    expect(caught.message).toContain('[REDACTED]');
    expect(caught.message).not.toContain('sk-secret-key');
    expect(logger.mock.calls.flat().join(' ')).not.toContain('private castle prompt');
  });

  it('retries one oversized result at low quality and then rejects it', async () => {
    const oversized = encoded(MAX_DECODED_IMAGE_BYTES + 1);
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => apiResponse(oversized));
    const handler = createImageToolHandlers({ apiKey: 'key', fetch: fetchMock as typeof fetch }).generate_image;
    const caught = await handler({ prompt: 'x', purpose: 'other', quality: 'high' }, context()).catch(error => error);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ quality: 'low' });
    expect(modelToolErrorValue(caught)).toMatchObject({ errorCode: 'VALIDATION_FAILED', details: { reason: 'IMAGE_TOO_LARGE' } });
  });

  it('loads edit source bytes through the app and sends multipart form data', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => apiResponse());
    const callApp = vi.fn(async (name: string) => name === 'get_image_binary' ? { mimeType: 'image/png', base64: encoded(3) } : { allowed: true });
    const handler = createImageToolHandlers({ apiKey: 'key', fetch: fetchMock as typeof fetch }).edit_image;
    await handler({ assetId: 'asset-1', prompt: 'add rain' }, context(callApp));
    expect(callApp.mock.calls.map(call => call[0])).toEqual(['authorize_capability', 'get_image_binary']);
    expect(fetchMock.mock.calls[0][0]).toContain('/images/edits');
    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get('model')).toBe('gpt-image-2');
    expect(body.get('image')).toBeInstanceOf(Blob);
  });

  it('uses the Gemini Interactions API for native generation and preserves its MIME type', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => geminiResponse());
    const ctx = context();
    const handler = createImageToolHandlers({
      provider: 'gemini',
      apiKey: 'gemini-key',
      model: 'gemini-3.1-flash-image',
      fetch: fetchMock as typeof fetch,
    }).generate_image;
    const result = await handler({ prompt: 'forest', purpose: 'background', aspectRatio: '16:9', resolution: '2K' }, ctx);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1beta/interactions');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'gemini-key' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gemini-3.1-flash-image',
      input: [{ type: 'text', text: 'forest' }],
      response_format: { type: 'image', aspect_ratio: '16:9', image_size: '2K' },
    });
    expect(JSON.parse(String(init.body)).response_format).not.toHaveProperty('mime_type');
    expect(ctx.callApp).toHaveBeenCalledWith('authorize_capability', expect.objectContaining({
      estimate: expect.objectContaining({ provider: 'Google Gemini Images', model: 'gemini-3.1-flash-image', size: '16:9 · 2K' }),
    }), 600_000);
    expect(ctx.emitImage).toHaveBeenCalledWith(expect.objectContaining({ provider: 'gemini', mimeType: 'image/png' }));
    expect(result).toMatchObject({ delivered: true, provider: 'gemini', model: 'gemini-3.1-flash-image' });
  });

  it('sends existing image bytes to Gemini editing and redacts API errors', async () => {
    const key = 'AIzaSecretGeminiKey1234567890';
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => geminiResponse('', false, 403));
    const callApp = vi.fn(async (name: string) => name === 'get_image_binary' ? { mimeType: 'image/png', base64: encoded(3) } : { allowed: true });
    const handler = createImageToolHandlers({ provider: 'gemini', apiKey: key, fetch: fetchMock as typeof fetch }).edit_image;
    const caught = await handler({ assetId: 'asset-1', prompt: 'add rain' }, context(callApp)).catch(error => error) as BridgeToolError;

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.input).toEqual([
      { type: 'text', text: 'add rain' },
      { type: 'image', data: encoded(3), mime_type: 'image/png' },
    ]);
    expect(caught.message).toContain('[REDACTED]');
    expect(caught.message).not.toContain(key);
    expect(caught.details).toMatchObject({ reason: 'GEMINI_API_AUTH_FAILED', provider: 'gemini', status: 403 });
  });
});

describe('BridgeToolRuntime', () => {
  it('dispatches by site and caps bridge image calls per turn', async () => {
    const callApp = vi.fn(async () => 'app');
    const runtime = new BridgeToolRuntime({ callApp, emit: vi.fn(), handlers: { generate_image: vi.fn(async () => 'bridge') } });
    const generation = { prompt: 'forest', purpose: 'background' };
    await expect(runtime.call('get_scene', { sceneId: 'scene-1' })).resolves.toBe('app');
    await expect(runtime.call('generate_image', generation)).resolves.toBe('bridge');
    await runtime.call('generate_image', generation); await runtime.call('generate_image', generation);
    await expect(runtime.call('generate_image', generation)).rejects.toMatchObject({ errorCode: 'VALIDATION_FAILED', details: { reason: 'IMAGE_TOOL_LIMIT' } });
    runtime.beginTurn();
    await expect(runtime.call('generate_image', generation)).resolves.toBe('bridge');
  });

  it('re-emits unacked results with the same id, clears on ack, and expires by TTL', async () => {
    let now = 1_000;
    const emit = vi.fn();
    const runtime = new BridgeToolRuntime({ callApp: vi.fn(), emit, now: () => now, handlers: { generate_image: async (_input, ctx) => ctx.emitImage({ requestId: 'same-id', base64: encoded(1) }) } });
    await runtime.call('generate_image', { prompt: 'forest', purpose: 'background' });
    emit.mockClear(); runtime.reemitBufferedImages();
    expect(emit).toHaveBeenCalledWith('image_result', expect.objectContaining({ requestId: 'same-id' }));
    runtime.acknowledgeImage('same-id'); expect(runtime.bufferedImageCount).toBe(0);
    await runtime.call('generate_image', { prompt: 'forest', purpose: 'background' }); now += 10 * 60_000 + 1;
    runtime.reemitBufferedImages(); expect(runtime.bufferedImageCount).toBe(0);
  });

  it('evicts the oldest image when the hard entry cap is exceeded', async () => {
    const emit = vi.fn(); let index = 0;
    const runtime = new BridgeToolRuntime({ callApp: vi.fn(), emit, handlers: { generate_image: async (_input, ctx) => ctx.emitImage({ requestId: `id-${index++}`, base64: encoded(1) }) } });
    for (let turn = 0; turn < 6; turn += 1) { runtime.beginTurn(); await runtime.call('generate_image', { prompt: 'forest', purpose: 'background' }); }
    expect(runtime.bufferedImageCount).toBe(5);
    emit.mockClear(); runtime.reemitBufferedImages();
    expect(emit.mock.calls.map(call => (call[1] as { requestId: string }).requestId)).toEqual(['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);
  });
});
