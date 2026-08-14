import { MAX_DECODED_IMAGE_BYTES } from '@/lib/bridge-protocol';
import type { BridgeImagePlacement } from '@/lib/bridge-protocol';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { getStoryImageAssets } from '@/lib/story-image-library';
import { useAppStore } from '@/stores/use-app-store';
import type { AiPermissionLevel } from './permissions';
import type { PendingAiImage } from './pending-image-storage';

export interface AiImageResult {
  requestId: string;
  purpose: string;
  prompt: string;
  mimeType: string;
  provider?: 'openai' | 'gemini';
  model?: string;
  placement?: BridgeImagePlacement;
  blob: Blob;
  blobUrl: string;
  width?: number;
  height?: number;
  estimatedCostUsd?: unknown;
  assetId?: string;
}

export function toPendingAiImage(result: AiImageResult, storyId: string, createdAt = Date.now()): PendingAiImage {
  return {
    requestId: result.requestId, storyId, purpose: result.purpose, prompt: result.prompt,
    mimeType: result.mimeType, provider: result.provider, model: result.model, placement: result.placement,
    blob: result.blob, width: result.width, height: result.height,
    estimatedCostUsd: result.estimatedCostUsd, createdAt,
  };
}

export function fromPendingAiImage(image: PendingAiImage): AiImageResult {
  return {
    requestId: image.requestId, purpose: image.purpose, prompt: image.prompt,
    mimeType: image.mimeType, provider: image.provider, model: image.model, placement: image.placement,
    blob: image.blob, blobUrl: URL.createObjectURL(image.blob),
    width: image.width, height: image.height, estimatedCostUsd: image.estimatedCostUsd,
  };
}

export function decodeImageResult(payload: unknown): AiImageResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.requestId !== 'string' || typeof value.base64 !== 'string'
    || typeof value.mimeType !== 'string' || !value.mimeType.startsWith('image/')) return null;
  try {
    const binary = atob(value.base64);
    if (binary.length > MAX_DECODED_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const blob = new Blob([bytes], { type: value.mimeType });
    return {
      requestId: value.requestId,
      purpose: typeof value.purpose === 'string' ? value.purpose : 'generated',
      prompt: typeof value.prompt === 'string' ? value.prompt : '',
      mimeType: value.mimeType,
      provider: value.provider === 'openai' || value.provider === 'gemini' ? value.provider : undefined,
      model: typeof value.model === 'string' ? value.model : undefined,
      placement: decodeImagePlacement(value.placement),
      blob,
      blobUrl: URL.createObjectURL(blob),
      width: typeof value.width === 'number' ? value.width : undefined,
      height: typeof value.height === 'number' ? value.height : undefined,
      estimatedCostUsd: value.estimatedCostUsd,
    };
  } catch {
    return null;
  }
}

function decodeImagePlacement(value: unknown): BridgeImagePlacement | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const placement = value as Record<string, unknown>;
  if (placement.kind === 'scene_background') {
    if (typeof placement.sceneId !== 'string' || (placement.operation !== 'insert' && placement.operation !== 'replace')) return undefined;
    if (placement.operation === 'replace' && typeof placement.stepId !== 'string') return undefined;
    if (placement.afterStepId !== undefined && placement.afterStepId !== null && typeof placement.afterStepId !== 'string') return undefined;
    if (placement.transition !== undefined && !['fade', 'dissolve', 'instant', 'wipe'].includes(String(placement.transition))) return undefined;
    if (placement.duration !== undefined && (typeof placement.duration !== 'number' || placement.duration < 0 || placement.duration > 30)) return undefined;
    return {
      kind: 'scene_background', sceneId: placement.sceneId, operation: placement.operation,
      ...(typeof placement.stepId === 'string' ? { stepId: placement.stepId } : {}),
      ...(placement.afterStepId === null || typeof placement.afterStepId === 'string' ? { afterStepId: placement.afterStepId } : {}),
      ...(typeof placement.transition === 'string' ? { transition: placement.transition as 'fade' | 'dissolve' | 'instant' | 'wipe' } : {}),
      ...(typeof placement.duration === 'number' ? { duration: placement.duration } : {}),
    };
  }
  if (placement.kind !== 'character_sprite' || typeof placement.characterId !== 'string' || typeof placement.spriteName !== 'string') return undefined;
  const scene = placement.scenePlacement;
  if (scene !== undefined && (!scene || typeof scene !== 'object')) return undefined;
  const scenePlacement = scene as Record<string, unknown> | undefined;
  if (scenePlacement && (typeof scenePlacement.sceneId !== 'string' || (scenePlacement.operation !== 'insert' && scenePlacement.operation !== 'replace'))) return undefined;
  if (scenePlacement?.operation === 'replace' && typeof scenePlacement.stepId !== 'string') return undefined;
  return {
    kind: 'character_sprite', characterId: placement.characterId, spriteName: placement.spriteName,
    ...(Array.isArray(placement.tags) && placement.tags.every((tag) => typeof tag === 'string') ? { tags: placement.tags as string[] } : {}),
    ...(typeof placement.setAsDefault === 'boolean' ? { setAsDefault: placement.setAsDefault } : {}),
    ...(scenePlacement ? { scenePlacement: scenePlacement as NonNullable<Extract<BridgeImagePlacement, { kind: 'character_sprite' }>['scenePlacement']> } : {}),
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  });
}

export async function imageResultToDataUri(
  result: Pick<AiImageResult, 'blob' | 'mimeType'>,
): Promise<string> {
  return `data:${result.mimeType};base64,${await blobToBase64(result.blob)}`;
}

export async function downscaleImage(blob: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const bitmap = await createImageBitmap(blob);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const ratio = Math.min(1, Math.sqrt(MAX_DECODED_IMAGE_BYTES / blob.size) * (0.9 ** attempt));
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, width, height);
      const candidate = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86 - attempt * 0.08));
      if (candidate && candidate.size <= MAX_DECODED_IMAGE_BYTES) return candidate;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

export async function getStoryImageBinary(storyId: string, assetId: string) {
  const state = useAppStore.getState();
  const asset = getStoryImageAssets(storyId, state.imageAssetIdsByStory, state.mediaLibrary)
    .find((item) => item.id === assetId);
  if (!asset) return { ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: 'Image not found in the active story' };
  const uri = await resolveAssetUri(asset.id);
  if (typeof uri !== 'string') return { ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: 'Image bytes are unavailable' };
  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read image');
    let blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Asset is not an image');
    if (blob.size > MAX_DECODED_IMAGE_BYTES) {
      const downscaled = await downscaleImage(blob);
      if (!downscaled) return {
        ok: false as const,
        errorCode: 'VALIDATION_FAILED' as const,
        errorMessage: `Image exceeds the ${MAX_DECODED_IMAGE_BYTES} byte limit and could not be downscaled`,
        details: { reason: 'IMAGE_TOO_LARGE', limitBytes: MAX_DECODED_IMAGE_BYTES },
      };
      blob = downscaled;
    }
    return { ok: true as const, result: { mimeType: blob.type, base64: await blobToBase64(blob) }, binaryTool: true as const };
  } catch (error: unknown) {
    return { ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: error instanceof Error ? error.message : 'Could not read image' };
  }
}

export function dataUriToImageResult(dataUri: string, requestId: string, prompt: string): AiImageResult | null {
  const match = dataUri.match(/^data:(image\/[^;,]+);base64,([\s\S]+)$/i);
  return match ? decodeImageResult({ requestId, purpose: 'background-removed', prompt, mimeType: match[1], base64: match[2] }) : null;
}

export async function executeRemoveBackground(
  storyId: string,
  assetId: string,
  permission: AiPermissionLevel,
  waitForConfirmation: () => Promise<boolean>,
  removeBackground: (uri: string) => Promise<string>,
  onResult: (result: AiImageResult) => void | Promise<void>,
) {
  const state = useAppStore.getState();
  const asset = getStoryImageAssets(storyId, state.imageAssetIdsByStory, state.mediaLibrary)
    .find((item) => item.id === assetId);
  if (!asset) return { ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: 'Image not found in the active story' };
  if (permission === 'blocked') return {
    ok: false as const,
    errorCode: 'PERMISSION_DENIED' as const,
    errorMessage: 'Background removal is blocked',
    details: { reason: 'USER_BLOCKED' },
  };
  if (permission === 'confirm' && !await waitForConfirmation()) return {
    ok: false as const,
    errorCode: 'PERMISSION_DENIED' as const,
    errorMessage: 'Background removal was declined',
    details: { reason: 'USER_DECLINED' },
  };
  const uri = await resolveAssetUri(asset.id);
  if (typeof uri !== 'string') return { ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: 'Image bytes are unavailable' };
  try {
    const dataUri = await removeBackground(uri);
    const result = dataUriToImageResult(dataUri, crypto.randomUUID(), asset.name);
    if (!result) throw new Error('Background removal returned an invalid image');
    await onResult(result);
    return { ok: true as const, result: { accepted: true, requestId: result.requestId } };
  } catch (error: unknown) {
    return { ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: error instanceof Error ? error.message : 'Background removal failed' };
  }
}
