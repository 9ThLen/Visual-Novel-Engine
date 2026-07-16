import { randomUUID } from 'node:crypto';
import { MAX_DECODED_IMAGE_BYTES } from '../../../lib/bridge-protocol';
import { getBridgeTool } from '../../../lib/ai/bridge-tools';
import { BridgeToolError } from './provider';
import type { BridgeToolHandler } from './tool-runtime';

const IMAGE_TIMEOUT_MS = 90_000;
const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_QUALITY = 'medium';
const DEFAULT_FORMAT = 'webp';
const OUTPUT_COMPRESSION = 85;

type Size = '1024x1024' | '1536x1024' | '1024x1536';
type Quality = 'low' | 'medium' | 'high';
type OutputFormat = 'webp' | 'jpeg' | 'png';
type Purpose = 'background' | 'character' | 'item' | 'other';
type ImageInput = { prompt: string; size: Size; quality: Quality; outputFormat: OutputFormat; purpose: Purpose; assetId?: string };

export interface ImageToolOptions {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
  logger?: (line: string) => void;
  debug?: boolean;
}

const costRanges: Record<Quality, [number, number]> = {
  low: [0.005, 0.03], medium: [0.02, 0.12], high: [0.08, 0.3],
};

function parseInput(value: unknown, edit: boolean): ImageInput {
  if (!value || typeof value !== 'object') throw new BridgeToolError('VALIDATION_FAILED', 'Image tool input must be an object');
  const input = value as Record<string, unknown>;
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const size = input.size ?? DEFAULT_SIZE;
  const quality = input.quality ?? DEFAULT_QUALITY;
  const outputFormat = input.outputFormat ?? DEFAULT_FORMAT;
  const purpose = input.purpose ?? 'other';
  if (!prompt) throw new BridgeToolError('VALIDATION_FAILED', 'prompt is required');
  if (!['1024x1024', '1536x1024', '1024x1536'].includes(String(size))) throw new BridgeToolError('VALIDATION_FAILED', 'Unsupported image size');
  if (!['low', 'medium', 'high'].includes(String(quality))) throw new BridgeToolError('VALIDATION_FAILED', 'Unsupported image quality');
  if (!['webp', 'jpeg', 'png'].includes(String(outputFormat))) throw new BridgeToolError('VALIDATION_FAILED', 'Unsupported output format');
  if (!['background', 'character', 'item', 'other'].includes(String(purpose))) throw new BridgeToolError('VALIDATION_FAILED', 'Unsupported image purpose');
  const assetId = typeof input.assetId === 'string' && input.assetId ? input.assetId : undefined;
  if (edit && !assetId) throw new BridgeToolError('VALIDATION_FAILED', 'assetId is required');
  return { prompt, size: size as Size, quality: quality as Quality, outputFormat: outputFormat as OutputFormat, purpose: purpose as Purpose, assetId };
}

function estimate(input: ImageInput, edit: boolean) {
  const [min, max] = costRanges[input.quality];
  const areaFactor = input.size === DEFAULT_SIZE ? 1 : 1.5;
  const inputFactor = edit ? 1.25 : 1;
  return { min: Number((min * areaFactor * inputFactor).toFixed(3)), max: Number((max * areaFactor * inputFactor).toFixed(3)), currency: 'USD' as const };
}

function mimeType(format: OutputFormat): string { return format === 'jpeg' ? 'image/jpeg' : `image/${format}`; }

function configurationError(): BridgeToolError {
  return new BridgeToolError('PROVIDER_UNAVAILABLE', 'Image generation is not configured. Set OPENAI_API_KEY in the bridge .env.', {
    reason: 'IMAGE_PROVIDER_NOT_CONFIGURED', hint: 'Set OPENAI_API_KEY in .env and restart the AI bridge.',
  });
}

function safeApiMessage(value: unknown, key: string): string {
  const fallback = 'OpenAI Images API request failed';
  if (!value || typeof value !== 'object') return fallback;
  const error = (value as Record<string, unknown>).error;
  const message = error && typeof error === 'object' ? (error as Record<string, unknown>).message : undefined;
  return (typeof message === 'string' ? message : fallback).replaceAll(key, '[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
}

async function requestImage(
  input: ImageInput,
  edit: boolean,
  source: { mimeType: string; base64: string } | undefined,
  quality: Quality,
  options: Required<Pick<ImageToolOptions, 'apiKey' | 'model' | 'fetch'>>,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    let body: BodyInit;
    let headers: HeadersInit = { Authorization: `Bearer ${options.apiKey}` };
    if (edit) {
      const form = new FormData();
      form.set('model', options.model); form.set('prompt', input.prompt); form.set('size', input.size);
      form.set('quality', quality); form.set('output_format', input.outputFormat); form.set('output_compression', String(OUTPUT_COMPRESSION));
      const bytes = Buffer.from(source!.base64, 'base64');
      form.set('image', new Blob([bytes], { type: source!.mimeType }), `source.${source!.mimeType.split('/')[1] || 'png'}`);
      body = form;
    } else {
      headers = { ...headers, 'Content-Type': 'application/json' };
      body = JSON.stringify({ model: options.model, prompt: input.prompt, size: input.size, quality, output_format: input.outputFormat, output_compression: OUTPUT_COMPRESSION });
    }
    const response = await options.fetch(`https://api.openai.com/v1/images/${edit ? 'edits' : 'generations'}`, { method: 'POST', headers, body, signal: controller.signal });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new BridgeToolError('PROVIDER_UNAVAILABLE', safeApiMessage(payload, options.apiKey), { reason: 'IMAGE_PROVIDER_ERROR', status: response.status });
    const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).data : undefined;
    const first = Array.isArray(data) ? data[0] : undefined;
    const base64 = first && typeof first === 'object' ? (first as Record<string, unknown>).b64_json : undefined;
    if (typeof base64 !== 'string') throw new BridgeToolError('PROVIDER_UNAVAILABLE', 'OpenAI Images API returned no image data', { reason: 'INVALID_IMAGE_RESPONSE' });
    return base64;
  } catch (error) {
    if (error instanceof BridgeToolError) throw error;
    if (controller.signal.aborted) throw new BridgeToolError('PROVIDER_UNAVAILABLE', 'OpenAI image request timed out', { reason: 'IMAGE_TIMEOUT' });
    throw new BridgeToolError('PROVIDER_UNAVAILABLE', error instanceof Error ? error.message.replaceAll(options.apiKey, '[REDACTED]') : 'OpenAI image request failed');
  } finally { clearTimeout(timer); }
}

export function createImageToolHandlers(rawOptions: ImageToolOptions = {}): Record<string, BridgeToolHandler> {
  const options = { apiKey: rawOptions.apiKey ?? process.env.OPENAI_API_KEY ?? '', model: rawOptions.model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL, fetch: rawOptions.fetch ?? fetch };
  const run = (toolName: 'generate_image' | 'edit_image', edit: boolean): BridgeToolHandler => async (value, context) => {
    if (!options.apiKey) throw configurationError();
    const input = parseInput(value, edit);
    const estimatedCostUsd = estimate(input, edit);
    const capability = getBridgeTool(toolName)?.requiresCapability;
    if (!capability) throw new BridgeToolError('PROVIDER_UNAVAILABLE', `${toolName} has no capability policy`);
    await context.callApp('authorize_capability', {
      capability,
      estimate: {
        provider: 'OpenAI',
        costUsdRange: estimatedCostUsd,
        model: options.model,
        size: input.size,
        quality: input.quality,
      },
    }, 600_000);
    let source: { mimeType: string; base64: string } | undefined;
    if (edit) {
      const result = await context.callApp('get_image_binary', { assetId: input.assetId });
      if (!result || typeof result !== 'object' || typeof (result as Record<string, unknown>).base64 !== 'string' || typeof (result as Record<string, unknown>).mimeType !== 'string') {
        throw new BridgeToolError('VALIDATION_FAILED', 'Image source bytes are invalid', { reason: 'INVALID_IMAGE_SOURCE' });
      }
      source = result as { mimeType: string; base64: string };
      if (Buffer.from(source.base64, 'base64').length > MAX_DECODED_IMAGE_BYTES) throw new BridgeToolError('VALIDATION_FAILED', 'Image source exceeds the bridge size limit', { reason: 'IMAGE_TOO_LARGE' });
    }
    const started = Date.now();
    const requestId = randomUUID();
    rawOptions.logger?.(`AI image request ${requestId} model=${options.model} size=${input.size}${rawOptions.debug ? ` prompt=${JSON.stringify(input.prompt)}` : ''}`);
    let base64 = await requestImage(input, edit, source, input.quality, options);
    if (Buffer.from(base64, 'base64').length > MAX_DECODED_IMAGE_BYTES && input.quality !== 'low') base64 = await requestImage(input, edit, source, 'low', options);
    const sizeBytes = Buffer.from(base64, 'base64').length;
    if (sizeBytes > MAX_DECODED_IMAGE_BYTES) throw new BridgeToolError('VALIDATION_FAILED', 'Generated image exceeds the bridge size limit after retry', { reason: 'IMAGE_TOO_LARGE', limitBytes: MAX_DECODED_IMAGE_BYTES });
    context.emitImage({ requestId, purpose: input.purpose, prompt: input.prompt, mimeType: mimeType(input.outputFormat), base64, estimatedCostUsd });
    rawOptions.logger?.(`AI image result ${requestId} model=${options.model} size=${input.size} durationMs=${Date.now() - started}`);
    return { delivered: true, sizeBytes, purpose: input.purpose };
  };
  return { generate_image: run('generate_image', false), edit_image: run('edit_image', true) };
}
