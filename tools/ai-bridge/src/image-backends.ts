import type { BridgeImagePlacement, BridgeImageProvider } from '../../../lib/bridge-protocol';
import { BridgeToolError } from './provider';

const IMAGE_TIMEOUT_MS = 90_000;
const OUTPUT_COMPRESSION = 85;
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export type ImageAspectRatio = '1:1' | '3:2' | '2:3' | '4:3' | '3:4' | '16:9' | '9:16';
export type ImageResolution = '1K' | '2K' | '4K';
export type ImageQuality = 'draft' | 'standard' | 'high';
export type ImageOutputFormat = 'webp' | 'jpeg' | 'png';
export type ImagePurpose = 'background' | 'character' | 'item' | 'other';

export interface ImageToolInput {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  quality: ImageQuality;
  outputFormat: ImageOutputFormat;
  purpose: ImagePurpose;
  assetId?: string;
  placement?: BridgeImagePlacement;
}

export interface ImageSource {
  mimeType: string;
  base64: string;
}

export interface ImageBackendResult {
  base64: string;
  mimeType: string;
}

export interface ImageCostEstimate {
  min: number;
  max: number;
  currency: 'USD';
}

export interface ImageGenerationBackend {
  provider: BridgeImageProvider;
  label: string;
  model: string;
  configured: boolean;
  configurationError(): BridgeToolError;
  estimate(input: ImageToolInput, edit: boolean): ImageCostEstimate;
  request(input: ImageToolInput, edit: boolean, source: ImageSource | undefined, degraded: boolean): Promise<ImageBackendResult>;
}

export interface ImageBackendOptions {
  apiKey: string;
  model: string;
  fetch: typeof fetch;
}

function redact(value: string, key: string): string {
  return value
    .replaceAll(key, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/(GEMINI_API_KEY\s*[=:]\s*)\S+/gi, '$1[REDACTED]');
}

function providerMessage(payload: unknown, fallback: string, key: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const error = (payload as Record<string, unknown>).error;
  const message = error && typeof error === 'object' ? (error as Record<string, unknown>).message : undefined;
  return redact(typeof message === 'string' ? message : fallback, key);
}

function openAiSize(aspectRatio: ImageAspectRatio): '1024x1024' | '1536x1024' | '1024x1536' {
  if (['16:9', '3:2', '4:3'].includes(aspectRatio)) return '1536x1024';
  if (['9:16', '2:3', '3:4'].includes(aspectRatio)) return '1024x1536';
  return '1024x1024';
}

function openAiQuality(quality: ImageQuality, degraded: boolean): 'low' | 'medium' | 'high' {
  if (degraded || quality === 'draft') return 'low';
  return quality === 'high' ? 'high' : 'medium';
}

function requestedMimeType(format: ImageOutputFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function createOpenAiImageBackend(options: ImageBackendOptions): ImageGenerationBackend {
  const estimate = (input: ImageToolInput, edit: boolean): ImageCostEstimate => {
    const ranges: Record<ImageQuality, [number, number]> = {
      draft: [0.005, 0.03], standard: [0.02, 0.12], high: [0.08, 0.3],
    };
    const [min, max] = ranges[input.quality];
    const shapeFactor = input.aspectRatio === '1:1' ? 1 : 1.5;
    const editFactor = edit ? 1.25 : 1;
    return {
      min: Number((min * shapeFactor * editFactor).toFixed(3)),
      max: Number((max * shapeFactor * editFactor).toFixed(3)),
      currency: 'USD',
    };
  };

  return {
    provider: 'openai',
    label: 'OpenAI Images',
    model: options.model,
    configured: Boolean(options.apiKey),
    configurationError: () => new BridgeToolError('PROVIDER_UNAVAILABLE', 'Image generation is not configured. Set OPENAI_API_KEY in the bridge .env.', {
      reason: 'IMAGE_PROVIDER_NOT_CONFIGURED', provider: 'openai', hint: 'Set OPENAI_API_KEY in .env and restart the AI bridge.',
    }),
    estimate,
    request: async (input, edit, source, degraded) => {
      let body: BodyInit;
      let headers: HeadersInit = { Authorization: `Bearer ${options.apiKey}` };
      const quality = openAiQuality(input.quality, degraded);
      const size = openAiSize(input.aspectRatio);
      if (edit) {
        const form = new FormData();
        form.set('model', options.model);
        form.set('prompt', input.prompt);
        form.set('size', size);
        form.set('quality', quality);
        form.set('output_format', input.outputFormat);
        form.set('output_compression', String(OUTPUT_COMPRESSION));
        const bytes = Buffer.from(source!.base64, 'base64');
        form.set('image', new Blob([bytes], { type: source!.mimeType }), `source.${source!.mimeType.split('/')[1] || 'png'}`);
        body = form;
      } else {
        headers = { ...headers, 'Content-Type': 'application/json' };
        body = JSON.stringify({ model: options.model, prompt: input.prompt, size, quality, output_format: input.outputFormat, output_compression: OUTPUT_COMPRESSION });
      }
      try {
        const response = await fetchWithTimeout(options.fetch, `https://api.openai.com/v1/images/${edit ? 'edits' : 'generations'}`, { method: 'POST', headers, body });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new BridgeToolError('PROVIDER_UNAVAILABLE', providerMessage(payload, 'OpenAI Images API request failed', options.apiKey), { reason: 'IMAGE_PROVIDER_ERROR', provider: 'openai', status: response.status });
        const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).data : undefined;
        const first = Array.isArray(data) ? data[0] : undefined;
        const base64 = first && typeof first === 'object' ? (first as Record<string, unknown>).b64_json : undefined;
        if (typeof base64 !== 'string') throw new BridgeToolError('PROVIDER_UNAVAILABLE', 'OpenAI Images API returned no image data', { reason: 'INVALID_IMAGE_RESPONSE', provider: 'openai' });
        return { base64, mimeType: requestedMimeType(input.outputFormat) };
      } catch (error) {
        if (error instanceof BridgeToolError) throw error;
        if (error instanceof Error && error.name === 'AbortError') throw new BridgeToolError('PROVIDER_UNAVAILABLE', 'OpenAI image request timed out', { reason: 'IMAGE_TIMEOUT', provider: 'openai' });
        throw new BridgeToolError('PROVIDER_UNAVAILABLE', redact(error instanceof Error ? error.message : 'OpenAI image request failed', options.apiKey), { provider: 'openai' });
      }
    },
  };
}

function geminiPrice(model: string, resolution: ImageResolution): number {
  if (model.includes('flash-lite-image')) return 0.0336;
  if (model.includes('3-pro-image')) return resolution === '4K' ? 0.24 : 0.134;
  if (model.includes('2.5-flash-image')) return 0.039;
  if (model.includes('3.1-flash-image')) return resolution === '4K' ? 0.151 : resolution === '2K' ? 0.101 : 0.067;
  return resolution === '4K' ? 0.25 : resolution === '2K' ? 0.15 : 0.08;
}

function findGeminiImage(payload: unknown): ImageBackendResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const steps = (payload as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) return null;
  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = steps[stepIndex];
    if (!step || typeof step !== 'object' || (step as Record<string, unknown>).type !== 'model_output') continue;
    const content = (step as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (let contentIndex = content.length - 1; contentIndex >= 0; contentIndex -= 1) {
      const block = content[contentIndex];
      if (!block || typeof block !== 'object') continue;
      const value = block as Record<string, unknown>;
      if (value.type !== 'image' || typeof value.data !== 'string') continue;
      const mimeType = typeof value.mime_type === 'string' ? value.mime_type : 'image/png';
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) return null;
      return { base64: value.data, mimeType };
    }
  }
  return null;
}

export function createGeminiImageBackend(options: ImageBackendOptions): ImageGenerationBackend {
  return {
    provider: 'gemini',
    label: 'Google Gemini Images',
    model: options.model,
    configured: Boolean(options.apiKey),
    configurationError: () => new BridgeToolError('PROVIDER_UNAVAILABLE', 'Image generation is not configured. Set GEMINI_API_KEY in the bridge .env.', {
      reason: 'IMAGE_PROVIDER_NOT_CONFIGURED', provider: 'gemini', hint: 'Set GEMINI_API_KEY in .env and restart the AI bridge.',
    }),
    estimate: (input) => {
      const value = geminiPrice(options.model, input.resolution);
      return { min: value, max: value, currency: 'USD' };
    },
    request: async (input, _edit, source, degraded) => {
      const imageSize = degraded ? '1K' : input.resolution;
      const requestInput: Array<Record<string, string>> = [{ type: 'text', text: input.prompt }];
      if (source) requestInput.push({ type: 'image', data: source.base64, mime_type: source.mimeType });
      const responseFormat: Record<string, string> = {
        type: 'image',
        aspect_ratio: input.aspectRatio,
        image_size: imageSize,
      };
      // Gemini can return WebP ImageContent, but the Interactions API does not
      // currently document image/webp as a selectable ImageResponseFormat.
      // Leave it unspecified and preserve the actual MIME returned by Google.
      if (input.outputFormat === 'jpeg') responseFormat.mime_type = 'image/jpeg';
      if (input.outputFormat === 'png') responseFormat.mime_type = 'image/png';
      try {
        const response = await fetchWithTimeout(options.fetch, GEMINI_INTERACTIONS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify({ model: options.model, input: requestInput, response_format: responseFormat }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const reason = response.status === 401 || response.status === 403
            ? 'GEMINI_API_AUTH_FAILED'
            : response.status === 404
              ? 'GEMINI_MODEL_UNAVAILABLE'
              : response.status === 429
                ? 'GEMINI_RATE_LIMITED'
                : 'IMAGE_PROVIDER_ERROR';
          throw new BridgeToolError('PROVIDER_UNAVAILABLE', providerMessage(payload, 'Gemini Image API request failed', options.apiKey), { reason, provider: 'gemini', status: response.status });
        }
        const image = findGeminiImage(payload);
        if (!image) throw new BridgeToolError('PROVIDER_UNAVAILABLE', 'Gemini Image API returned no supported image data', { reason: 'INVALID_IMAGE_RESPONSE', provider: 'gemini' });
        return image;
      } catch (error) {
        if (error instanceof BridgeToolError) throw error;
        if (error instanceof Error && error.name === 'AbortError') throw new BridgeToolError('PROVIDER_UNAVAILABLE', 'Gemini image request timed out', { reason: 'IMAGE_TIMEOUT', provider: 'gemini' });
        throw new BridgeToolError('PROVIDER_UNAVAILABLE', redact(error instanceof Error ? error.message : 'Gemini image request failed', options.apiKey), { provider: 'gemini' });
      }
    },
  };
}
