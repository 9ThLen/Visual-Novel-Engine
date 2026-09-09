import { Platform } from 'react-native';
import { MAX_VIDEO_ASSET_BYTES, isSupportedVideoMimeType } from './media-library-service';
import { openWebFileDialog } from './web-file-input';

export interface PickedVideo {
  /**
   * blob: URI on web, file:// (or content://) URI on native. Both are accepted
   * by addAssetToLibrary — bytes never travel as a string.
   */
  uri: string;
  name: string;
  /** Absent when the platform picker did not report one — see pickVideoNative. */
  size?: number;
  mimeType: string;
  /** Read from metadata on web; native pickers do not report it. */
  durationSeconds?: number;
  /** Web only: release the object URL once the asset has been persisted. */
  release?: () => void;
}

export type PickVideoResult =
  | { status: 'picked'; video: PickedVideo }
  | { status: 'cancelled' }
  | { status: 'tooLarge'; size: number; limit: number }
  | { status: 'unsupportedType'; mimeType: string };

function mimeTypeForName(name: string, declared?: string | null): string {
  if (declared && declared !== 'application/octet-stream') return declared;
  return name.toLowerCase().endsWith('.mp4') ? 'video/mp4' : '';
}

/**
 * Reject before the media service reads/copies bytes, so a known-oversized clip
 * never enters the JS heap or the app's media directory.
 * An unknown size cannot be judged here — the media service re-checks the
 * copied file, which is the only measure that cannot be wrong.
 */
function checkFile(size: number | undefined, mimeType: string): PickVideoResult | null {
  if (!isSupportedVideoMimeType(mimeType)) {
    return { status: 'unsupportedType', mimeType: mimeType || 'unknown' };
  }
  if (typeof size === 'number' && size > MAX_VIDEO_ASSET_BYTES) {
    return { status: 'tooLarge', size, limit: MAX_VIDEO_ASSET_BYTES };
  }
  return null;
}

/**
 * Duration comes from the metadata header, so the browser only fetches the
 * start of the file — it never decodes the clip.
 */
function readDurationSeconds(objectUrl: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(undefined);
      return;
    }
    const probe = document.createElement('video');
    let settled = false;
    const finish = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      probe.removeAttribute('src');
      resolve(value);
    };
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) ? probe.duration : undefined);
    probe.onerror = () => finish(undefined);
    setTimeout(() => finish(undefined), 3000);
    probe.src = objectUrl;
  });
}

/**
 * Describe a File the browser already handed us — from the dialog, or dropped
 * onto the library. Same validation either way: where a file came from says
 * nothing about whether it can be played.
 */
export async function describePickedVideoFile(file: File): Promise<PickVideoResult> {
  const mimeType = mimeTypeForName(file.name, file.type);
  const rejected = checkFile(file.size, mimeType);
  if (rejected) return rejected;

  // An object URL hands the Blob to the media service by reference; reading the
  // file into a data URI would copy tens of megabytes through the JS heap.
  const uri = URL.createObjectURL(file);
  return {
    status: 'picked',
    video: {
      uri,
      name: file.name || 'video.mp4',
      size: file.size,
      mimeType,
      durationSeconds: await readDurationSeconds(uri),
      release: () => URL.revokeObjectURL(uri),
    },
  };
}

async function pickVideoWeb(): Promise<PickVideoResult> {
  const file = await openWebFileDialog('video/mp4,.mp4');
  if (!file) return { status: 'cancelled' };
  return describePickedVideoFile(file);
}

async function pickVideoNative(): Promise<PickVideoResult> {
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: 'video/mp4',
    // Read provider metadata first. The media service performs the one
    // app-managed copy after type/size validation; copying here would duplicate
    // a large clip into cache before we have a chance to reject it.
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return { status: 'cancelled' };

  const asset = result.assets[0];
  const mimeType = mimeTypeForName(asset.name ?? '', asset.mimeType);
  // Android in particular often reports no size at all. Treating that as 0
  // would wave an oversized file straight through the limit check.
  const size = typeof asset.size === 'number' && Number.isFinite(asset.size) ? asset.size : undefined;
  const rejected = checkFile(size, mimeType);
  if (rejected) return rejected;

  return {
    status: 'picked',
    video: {
      uri: asset.uri,
      name: asset.name || 'video.mp4',
      size,
      mimeType,
    },
  };
}

/**
 * Open the platform picker for an MP4 and return a reference the media library
 * can persist. Format and reported size are checked before the app copies the
 * file; when size is absent, the media service verifies its controlled copy.
 */
export function pickVideoFromDevice(): Promise<PickVideoResult> {
  return Platform.OS === 'web' ? pickVideoWeb() : pickVideoNative();
}
