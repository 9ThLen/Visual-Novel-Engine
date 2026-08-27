/**
 * Media Library Service
 * Manages media assets (images, audio, video) for stories.
 *
 * NOTE: This file contains only pure functions. Store access is in
 * stores/media-library-actions.ts. This resolves the layer boundary
 * violation (lib/ should not import from stores/).
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import {
  createMediaBlobUri,
  hasMediaBlob,
  putMediaBlob,
} from './idb-storage';
import { generateAssetId } from './id-utils';
import { STORY_BACKUP_LIMITS } from './story-backup/types';

export type AssetType = 'image' | 'audio' | 'video' | 'other';

/**
 * Upper bound for an imported video, shared with the backup object limit so a
 * story that imports a clip can always export it to `.vnebackup`.
 */
export const MAX_VIDEO_ASSET_BYTES = STORY_BACKUP_LIMITS.maxObjectBytes;

/** The container the MVP promises; anything else has to prove itself first. */
export const SUPPORTED_VIDEO_MIME_TYPES = ['video/mp4'] as const;

/**
 * Same bound as video, and for the same reason: a story that imports a track
 * has to be able to export it to `.vnebackup` again.
 */
export const MAX_AUDIO_ASSET_BYTES = STORY_BACKUP_LIMITS.maxObjectBytes;

/**
 * What `expo-audio` plays on both platforms. `audio/mp4` covers the .m4a a
 * phone recorder produces; `audio/x-m4a` is Safari's spelling of the same file.
 */
export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
] as const;

function isSupportedMimeType(mimeType: string | null | undefined, supported: readonly string[]): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  return supported.includes(normalized);
}

export function isSupportedVideoMimeType(mimeType: string | null | undefined): boolean {
  return isSupportedMimeType(mimeType, SUPPORTED_VIDEO_MIME_TYPES);
}

export function isSupportedAudioMimeType(mimeType: string | null | undefined): boolean {
  return isSupportedMimeType(mimeType, SUPPORTED_AUDIO_MIME_TYPES);
}

function hasSupportedVideoIdentity(
  filename: string,
  mimeType: string | null | undefined,
): boolean {
  if (mimeType) return isSupportedVideoMimeType(mimeType);
  return filename.toLowerCase().endsWith('.mp4');
}

export interface LibraryAsset {
  id: string;
  type: AssetType;
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  /** Video only, when the platform could read it without decoding the file. */
  durationSeconds?: number;
  contentHash?: string;
  addedAt: number;
}

type ParsedDataUri = {
  mimeType: string;
  base64: string;
  extension: string;
  contentHash: string;
};

function getDataUriExtension(mimeType: string, type: AssetType): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/wav') return 'wav';
  if (normalized === 'audio/ogg') return 'ogg';
  if (normalized === 'video/mp4') return 'mp4';
  if (type === 'image') return 'png';
  if (type === 'audio') return 'mp3';
  if (type === 'video') return 'mp4';
  return 'bin';
}

function defaultExtensionForType(type: AssetType): string {
  if (type === 'image') return '.png';
  if (type === 'audio') return '.mp3';
  if (type === 'video') return '.mp4';
  return '.bin';
}

function stableContentHash(value: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    hashA ^= char;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB = Math.imul(hashB ^ char, 0x85ebca6b) >>> 0;
  }
  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

function parseBase64DataUri(uri: string, type: AssetType): ParsedDataUri | null {
  // A clip is tens of megabytes: decoding it into a base64 string would blow
  // the JS heap on mobile. Video is imported from a File/Blob or copied on
  // disk, never through a data URI.
  if (type === 'video') return null;

  const match = uri.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (type === 'image' && (!mimeType.startsWith('image/') || mimeType === 'image/svg+xml')) {
    return null;
  }
  if (type === 'audio' && !mimeType.startsWith('audio/')) {
    return null;
  }
  if (type === 'other' && (!mimeType || mimeType === 'image/svg+xml')) return null;

  const base64 = match[2].replace(/\s/g, '');
  if (!base64) return null;

  return {
    mimeType,
    base64,
    extension: getDataUriExtension(mimeType, type),
    contentHash: stableContentHash(`${mimeType}:${base64}`),
  };
}

function dataUriToBlob(parsed: ParsedDataUri): Blob {
  const binary = atob(parsed.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: parsed.mimeType });
}

function validateMediaBlob(blob: Blob, type: AssetType): void {
  const mimeType = blob.type.toLowerCase();
  const valid = type === 'image'
    ? mimeType.startsWith('image/') && mimeType !== 'image/svg+xml'
    : type === 'audio'
      ? mimeType.startsWith('audio/')
      : type === 'video'
        ? isSupportedVideoMimeType(mimeType)
        : mimeType.length > 0 && mimeType !== 'image/svg+xml';
  if (!valid || blob.size <= 0) throw new Error(`Invalid ${type} upload`);
  if (type === 'video' && blob.size > MAX_VIDEO_ASSET_BYTES) {
    throw new Error(`Video exceeds ${MAX_VIDEO_ASSET_BYTES} bytes`);
  }
}

async function persistWebMediaBlob(
  uri: string,
  type: AssetType,
  parsedDataUri: ParsedDataUri | null,
  fallbackStorageKey: string,
): Promise<{ blob: Blob; storageKey: string }> {
  if (uri.startsWith('data:')) {
    if (!parsedDataUri) throw new Error(`Invalid ${type} data URI`);
    const blob = dataUriToBlob(parsedDataUri);
    validateMediaBlob(blob, type);
    return { blob, storageKey: parsedDataUri.contentHash };
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Could not read ${type} Blob`);
  const blob = await response.blob();
  validateMediaBlob(blob, type);
  return { blob, storageKey: fallbackStorageKey };
}

/** Whether the Blob migration is able to convert this inline data URI at all. */
export function canConvertDataUri(uri: string, type: AssetType): boolean {
  return parseBase64DataUri(uri, type) !== null;
}

/** Persist a legacy web data URI without changing the owning asset's identity. */
export async function persistWebDataUri(
  uri: string,
  type: AssetType,
): Promise<string> {
  const parsed = parseBase64DataUri(uri, type);
  if (!parsed) throw new Error(`Invalid ${type} data URI`);
  const blob = dataUriToBlob(parsed);
  validateMediaBlob(blob, type);
  if (!await hasMediaBlob(parsed.contentHash)) {
    await putMediaBlob(parsed.contentHash, blob);
  }
  return createMediaBlobUri(parsed.contentHash);
}

/**
 * Get library asset by ID (pure function)
 */
export function getLibraryAssetById(
  assetId: string,
  assets: LibraryAsset[],
): LibraryAsset | undefined {
  return assets.find((asset) => asset.id === assetId);
}

/**
 * Resolve library asset URI (pure function)
 */
export function resolveLibraryAssetUri(
  assetRef: string | null | undefined,
  assets: LibraryAsset[],
): string | null {
  if (!assetRef) {
    return null;
  }
  const isUriLike = /^(file|content|blob|data|idb|https?):/i.test(assetRef) || assetRef.startsWith('/') || assetRef.startsWith('assets/');
  if (isUriLike) {
    return assetRef;
  }
  return getLibraryAssetById(assetRef, assets)?.uri ?? null;
}

/**
 * Add asset to library (pure function — returns new asset and updated list)
 */
export async function addAssetToLibraryPure(
  uri: string,
  name: string,
  type: AssetType,
  assets: LibraryAsset[],
  metadata?: { mimeType?: string; size?: number; durationSeconds?: number },
): Promise<{ asset: LibraryAsset; assets: LibraryAsset[] }> {
  const filename = name || uri.split('/').pop() || `asset-${Date.now()}`;
  const ext = filename.includes('.') ? '' : defaultExtensionForType(type);
  const fullFilename = filename.includes('.') ? filename : `${filename}${ext}`;
  /**
   * Whether this file has to keep an identity of its own.
   *
   * Two files picked out of two folders can share a name and a size, and that
   * is a duplicate hint for the UI, never proof of sameness. A data URI is the
   * exception: it is stored under the hash of its own bytes, so identical
   * content genuinely is the same asset and merging it is correct.
   *
   * Both halves of the aliasing follow from this. The name-based merge is
   * skipped, or the second import would return the first asset and drop the new
   * file; and the on-disk name carries the asset id, or the copy would find a
   * file of that name already in place and adopt the earlier one's bytes.
   */
  const keepsOwnIdentity = type === 'video' || (type === 'audio' && !uri.startsWith('data:'));
  const reservedAssetId = keepsOwnIdentity ? generateAssetId() : null;
  const newAsset = (targetUri: string, assetId = reservedAssetId ?? generateAssetId()): LibraryAsset => ({
    id: assetId,
    type,
    uri: targetUri,
    name: name || filename,
    addedAt: Date.now(),
    ...(metadata?.mimeType ? { mimeType: metadata.mimeType } : {}),
    ...(typeof metadata?.size === 'number' ? { size: metadata.size } : {}),
    ...(typeof metadata?.durationSeconds === 'number' ? { durationSeconds: metadata.durationSeconds } : {}),
  });

  if (type === 'video') {
    if (uri.startsWith('data:')) {
      throw new Error('Video assets cannot be imported from a data URI');
    }
    if (!hasSupportedVideoIdentity(fullFilename, metadata?.mimeType)) {
      throw new Error('Invalid video upload: only MP4 is supported');
    }
    if (typeof metadata?.size === 'number' && metadata.size > MAX_VIDEO_ASSET_BYTES) {
      throw new Error(`Video exceeds ${MAX_VIDEO_ASSET_BYTES} bytes`);
    }
  }

  // Same bound as video: a track the story cannot back up is one the author
  // would lose on the next export.
  if (type === 'audio' && typeof metadata?.size === 'number' && metadata.size > MAX_AUDIO_ASSET_BYTES) {
    throw new Error(`Audio exceeds ${MAX_AUDIO_ASSET_BYTES} bytes`);
  }

  const existingByUri = assets.find((a) => a.uri === uri);
  if (existingByUri) {
    return { asset: existingByUri, assets };
  }

  // Matching on name alone is only safe for assets we already copied into the
  // library directory, and only for files whose identity is not their own —
  // see `keepsOwnIdentity`.
  const existingByName = keepsOwnIdentity
    ? undefined
    : assets.find((a) => a.name === name || a.name === filename);
  if (existingByName && existingByName.uri.includes('media-library')) {
    try {
      const info = await FileSystem.getInfoAsync(existingByName.uri);
      if (info.exists) {
        return { asset: existingByName, assets };
      }
    } catch {
    }
  }

  if (uri.startsWith('assets/') || uri.startsWith('bundle://')) {
    const asset = newAsset(uri);
    return { asset, assets: [...assets, asset] };
  }

  const parsedDataUri = uri.startsWith('data:') ? parseBase64DataUri(uri, type) : null;
  if (Platform.OS === 'web' && (uri.startsWith('data:') || uri.startsWith('blob:'))) {
    const generatedAssetId = generateAssetId();
    if (parsedDataUri) {
      const targetUri = await persistWebDataUri(uri, type);
      const existingByTargetUri = assets.find((asset) => asset.uri === targetUri);
      if (existingByTargetUri) return { asset: existingByTargetUri, assets };
      const asset = newAsset(targetUri, generatedAssetId);
      return { asset, assets: [...assets, asset] };
    }

    const persisted = await persistWebMediaBlob(uri, type, parsedDataUri, generatedAssetId);
    const targetUri = createMediaBlobUri(persisted.storageKey);
    const existingByTargetUri = assets.find((asset) => asset.uri === targetUri);
    if (existingByTargetUri) {
      if (!await hasMediaBlob(persisted.storageKey)) {
        await putMediaBlob(persisted.storageKey, persisted.blob);
      }
      return { asset: existingByTargetUri, assets };
    }

    if (!await hasMediaBlob(persisted.storageKey)) {
      await putMediaBlob(persisted.storageKey, persisted.blob);
    }
    const asset = newAsset(targetUri, generatedAssetId);
    return { asset, assets: [...assets, asset] };
  }

  if (parsedDataUri) {
    if (!FileSystem.documentDirectory) {
      const asset = newAsset(uri);
      return { asset, assets: [...assets, asset] };
    }

    const dirPath = `${FileSystem.documentDirectory}media-library/${type}s/`;
    const targetPath = `${dirPath}${parsedDataUri.contentHash}.${parsedDataUri.extension}`;
    const existingByTargetUri = assets.find((a) => a.uri === targetPath);
    if (existingByTargetUri) {
      return { asset: existingByTargetUri, assets };
    }

    try {
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
    } catch {
    }

    try {
      const checkTarget = await FileSystem.getInfoAsync(targetPath);
      if (checkTarget.exists) {
        const asset = newAsset(targetPath);
        return { asset, assets: [...assets, asset] };
      }

      await FileSystem.writeAsStringAsync(targetPath, parsedDataUri.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const verifyInfo = await FileSystem.getInfoAsync(targetPath);
      if (verifyInfo.exists && verifyInfo.size > 0) {
        const asset = newAsset(targetPath);
        return { asset, assets: [...assets, asset] };
      }
    } catch {
    }
  }

  if (uri.startsWith('data:')) {
    const asset = newAsset(uri);
    return { asset, assets: [...assets, asset] };
  }

  if (!FileSystem.documentDirectory) {
    const asset = newAsset(uri);
    return { asset, assets: [...assets, asset] };
  }

  const targetFilename = reservedAssetId ? `${reservedAssetId}-${fullFilename}` : fullFilename;
  const targetPath = `${FileSystem.documentDirectory}media-library/${type}s/${targetFilename}`;
  const dirPath = `${FileSystem.documentDirectory}media-library/${type}s/`;

  try {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  } catch {
  }

  const checkTarget = await FileSystem.getInfoAsync(targetPath);
  if (checkTarget.exists) {
    const asset = newAsset(targetPath);
    return { asset, assets: [...assets, asset] };
  }

  let copySucceeded = false;
  let copiedSize: number | undefined;
  try {
    await FileSystem.copyAsync({ from: uri, to: targetPath });
    const verifyInfo = await FileSystem.getInfoAsync(targetPath);
    if (verifyInfo.exists && verifyInfo.size > 0) {
      // The picker's metadata can be missing or wrong — Android routinely
      // reports no size at all — so the copied bytes are the only trustworthy
      // measure of how big this file really is.
      const copiedLimit = type === 'video'
        ? MAX_VIDEO_ASSET_BYTES
        : type === 'audio' ? MAX_AUDIO_ASSET_BYTES : null;
      if (copiedLimit !== null && verifyInfo.size > copiedLimit) {
        try {
          await FileSystem.deleteAsync(targetPath, { idempotent: true });
        } catch {
        }
        throw new Error(`${type === 'video' ? 'Video' : 'Audio'} exceeds ${copiedLimit} bytes`);
      }
      copiedSize = verifyInfo.size;
      copySucceeded = true;
    }
  } catch (copyError) {
    // Reading the file back as base64 would defeat the whole point of copying
    // it on disk — and for media this large it is the very thing that blows the
    // JS heap — so a failed copy is reported instead of worked around.
    if (type === 'video' || type === 'audio') {
      try {
        await FileSystem.deleteAsync(targetPath, { idempotent: true });
      } catch {
      }
      throw copyError instanceof Error
        ? copyError
        : new Error(`Could not copy ${type} into the media library`);
    }
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(targetPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const verifyInfo = await FileSystem.getInfoAsync(targetPath);
      if (verifyInfo.exists && verifyInfo.size > 0) {
        copySucceeded = true;
      }
    } catch {
    }
  }

  if (copySucceeded) {
    const asset = newAsset(targetPath);
    const sized = typeof copiedSize === 'number' ? { ...asset, size: copiedSize } : asset;
    return { asset: sized, assets: [...assets, sized] };
  }

  if (type === 'video' || type === 'audio') {
    try {
      await FileSystem.deleteAsync(targetPath, { idempotent: true });
    } catch {
    }
    throw new Error(`Could not copy ${type} into the media library`);
  }

  const asset = newAsset(uri);
  return { asset, assets: [...assets, asset] };
}
