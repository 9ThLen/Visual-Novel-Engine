import { randomUUID } from 'node:crypto';
import type { BridgeImageProvider } from '../../../lib/bridge-protocol';
import type { BridgeImagePlacement } from '../../../lib/bridge-protocol';
import { MAX_DECODED_IMAGE_BYTES } from '../../../lib/bridge-protocol';
import { getBridgeTool } from '../../../lib/ai/bridge-tools';
import { BridgeToolError } from './provider';
import type { BridgeToolHandler } from './tool-runtime';
import {
  createGeminiImageBackend,
  createOpenAiImageBackend,
  type ImageAspectRatio,
  type ImageGenerationBackend,
  type ImageOutputFormat,
  type ImagePurpose,
  type ImageQuality,
  type ImageResolution,
  type ImageToolInput,
} from './image-backends';

const DEFAULT_OPENAI_MODEL = 'gpt-image-2';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-image';
const DEFAULT_ASPECT_RATIO: ImageAspectRatio = '1:1';
const DEFAULT_RESOLUTION: ImageResolution = '1K';
const DEFAULT_QUALITY: ImageQuality = 'standard';
const DEFAULT_FORMAT: ImageOutputFormat = 'webp';

export interface ImageToolOptions {
  provider?: BridgeImageProvider | 'none';
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
  logger?: (line: string) => void;
  debug?: boolean;
}

export interface ResolvedImageToolConfig {
  provider?: BridgeImageProvider;
  apiKey: string;
  model?: string;
  fetch: typeof fetch;
}

export function resolveImageToolConfig(raw: ImageToolOptions = {}): ResolvedImageToolConfig {
  if (raw.provider === 'none') return { apiKey: '', fetch: raw.fetch ?? fetch };
  const provider = raw.provider ?? 'openai';
  return {
    provider,
    apiKey: raw.apiKey ?? (provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY) ?? '',
    model: raw.model ?? (provider === 'gemini' ? process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_GEMINI_MODEL : process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_MODEL),
    fetch: raw.fetch ?? fetch,
  };
}

export function describeImageToolCapability(raw: ImageToolOptions = {}) {
  const config = resolveImageToolConfig(raw);
  return {
    supported: Boolean(config.provider && config.apiKey),
    ...(config.provider ? { provider: config.provider, model: config.model, modes: ['generate', 'edit'] as Array<'generate' | 'edit'> } : {}),
  };
}

function parseInput(value: unknown, edit: boolean): ImageToolInput {
  if (!value || typeof value !== 'object') throw new BridgeToolError('VALIDATION_FAILED', 'Image tool input must be an object');
  const input = value as Record<string, unknown>;
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const aspectRatio = input.aspectRatio ?? DEFAULT_ASPECT_RATIO;
  const resolution = input.resolution ?? DEFAULT_RESOLUTION;
  const quality = input.quality ?? DEFAULT_QUALITY;
  const outputFormat = input.outputFormat ?? DEFAULT_FORMAT;
  const purpose = input.purpose ?? 'other';
  if (!prompt) throw new BridgeToolError('VALIDATION_FAILED', 'prompt is required');
  if (!['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'].includes(String(aspectRatio))) throw new BridgeToolError('VALIDATION_FAILED', 'Unsupported image aspect ratio');
  if (!['1K', '2K', '4K'].includes(String(resolution))) throw new BridgeToolError('VALIDATION_FAILED', 'Unsupported image resolution');
  if (!['draft', 'standard', 'high'].includes(String(quality))) throw new BridgeToolError('VALIDATION_FAILED', 'Unsupported image quality');
  if (!['webp', 'jpeg', 'png'].includes(String(outputFormat))) throw new BridgeToolError('VALIDATION_FAILED', 'Unsupported output format');
  if (!['background', 'character', 'item', 'other'].includes(String(purpose))) throw new BridgeToolError('VALIDATION_FAILED', 'Unsupported image purpose');
  const assetId = typeof input.assetId === 'string' && input.assetId ? input.assetId : undefined;
  const placement = input.placement as BridgeImagePlacement | undefined;
  if (edit && !assetId) throw new BridgeToolError('VALIDATION_FAILED', 'assetId is required');
  return {
    prompt,
    aspectRatio: aspectRatio as ImageAspectRatio,
    resolution: resolution as ImageResolution,
    quality: quality as ImageQuality,
    outputFormat: outputFormat as ImageOutputFormat,
    purpose: purpose as ImagePurpose,
    assetId,
    placement,
  };
}

function createBackend(config: ResolvedImageToolConfig): ImageGenerationBackend | null {
  if (!config.provider || !config.model) return null;
  const options = { apiKey: config.apiKey, model: config.model, fetch: config.fetch };
  return config.provider === 'gemini' ? createGeminiImageBackend(options) : createOpenAiImageBackend(options);
}

function disabledError(): BridgeToolError {
  return new BridgeToolError('PROVIDER_UNAVAILABLE', 'Image generation is disabled for this bridge.', {
    reason: 'IMAGE_PROVIDER_DISABLED',
  });
}

export function createImageToolHandlers(rawOptions: ImageToolOptions = {}): Record<string, BridgeToolHandler> {
  const backend = createBackend(resolveImageToolConfig(rawOptions));
  const run = (toolName: 'generate_image' | 'edit_image', edit: boolean): BridgeToolHandler => async (value, context) => {
    if (!backend) throw disabledError();
    if (!backend.configured) throw backend.configurationError();
    const input = parseInput(value, edit);
    const estimatedCostUsd = backend.estimate(input, edit);
    const capability = getBridgeTool(toolName)?.requiresCapability;
    if (!capability) throw new BridgeToolError('PROVIDER_UNAVAILABLE', `${toolName} has no capability policy`);
    await context.callApp('authorize_capability', {
      capability,
      estimate: {
        provider: backend.label,
        costUsdRange: estimatedCostUsd,
        model: backend.model,
        size: `${input.aspectRatio} · ${input.resolution}`,
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
    rawOptions.logger?.(`AI image request ${requestId} provider=${backend.provider} model=${backend.model} aspectRatio=${input.aspectRatio} resolution=${input.resolution}${rawOptions.debug ? ` prompt=${JSON.stringify(input.prompt)}` : ''}`);
    let output = await backend.request(input, edit, source, false);
    if (Buffer.from(output.base64, 'base64').length > MAX_DECODED_IMAGE_BYTES && (input.quality !== 'draft' || input.resolution !== '1K')) {
      output = await backend.request({ ...input, resolution: '1K', quality: 'draft' }, edit, source, true);
    }
    const sizeBytes = Buffer.from(output.base64, 'base64').length;
    if (sizeBytes > MAX_DECODED_IMAGE_BYTES) throw new BridgeToolError('VALIDATION_FAILED', 'Generated image exceeds the bridge size limit after retry', { reason: 'IMAGE_TOO_LARGE', limitBytes: MAX_DECODED_IMAGE_BYTES });
    context.emitImage({
      requestId,
      purpose: input.purpose,
      prompt: input.prompt,
      provider: backend.provider,
      model: backend.model,
      mimeType: output.mimeType,
      base64: output.base64,
      estimatedCostUsd,
      ...(input.placement ? { placement: input.placement } : {}),
    });
    rawOptions.logger?.(`AI image result ${requestId} provider=${backend.provider} model=${backend.model} size=${sizeBytes} durationMs=${Date.now() - started}`);
    return { delivered: true, requestId, sizeBytes, purpose: input.purpose, provider: backend.provider, model: backend.model, placement: input.placement };
  };
  return { generate_image: run('generate_image', false), edit_image: run('edit_image', true) };
}
