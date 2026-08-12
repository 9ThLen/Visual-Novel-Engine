import { Platform } from 'react-native';

import { resolveAssetUri } from '@/lib/asset-resolver';
import { getMediaBlob, getMediaBlobStorageKey } from '@/lib/idb-storage';
import {
  sourceFromBlob,
  sourceFromReadableStream,
} from '@/lib/story-backup/hash';
import type { StoryArchiveBinarySource } from '@/lib/story-backup/types';

export interface ResolvedStoryBackupSource {
  source: StoryArchiveBinarySource;
  mimeType: string;
  size: number;
}

async function sourceFromResolvedUri(uri: string): Promise<ResolvedStoryBackupSource> {
  if (Platform.OS !== 'web' && /^(file|content):/i.test(uri)) {
    const { File } = await import('expo-file-system');
    const file = new File(uri);
    if (!file.exists) throw new Error(`Missing media file: ${uri}`);
    return {
      source: sourceFromReadableStream(() => file.readableStream(), file.size),
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    };
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Cannot read media file: ${uri}`);
  const blob = await response.blob();
  if (blob.size <= 0) throw new Error(`Media file is empty: ${uri}`);
  return {
    source: sourceFromBlob(blob),
    mimeType: blob.type || response.headers.get('content-type') || 'application/octet-stream',
    size: blob.size,
  };
}

export async function resolveStoryBackupSource(uri: string): Promise<ResolvedStoryBackupSource> {
  const storageKey = getMediaBlobStorageKey(uri);
  if (storageKey) {
    const blob = await getMediaBlob(storageKey);
    if (!blob) throw new Error(`Missing IndexedDB media: ${storageKey}`);
    return {
      source: sourceFromBlob(blob),
      mimeType: blob.type || 'application/octet-stream',
      size: blob.size,
    };
  }

  const resolved = await resolveAssetUri(uri);
  if (typeof resolved === 'number') {
    const { Asset } = await import('expo-asset');
    const asset = Asset.fromModule(resolved);
    await asset.downloadAsync();
    const assetUri = asset.localUri || asset.uri;
    if (!assetUri) throw new Error(`Cannot resolve bundled media: ${uri}`);
    return sourceFromResolvedUri(assetUri);
  }
  if (typeof resolved !== 'string' || !resolved) throw new Error(`Cannot resolve media: ${uri}`);
  return sourceFromResolvedUri(resolved);
}
