import { Platform } from 'react-native';
import { MAX_AUDIO_ASSET_BYTES, isSupportedAudioMimeType } from './media-library-service';
import { openWebFileDialog } from './web-file-input';

export interface PickedAudio {
  /**
   * blob: URI on web, file:// (or content://) URI on native. Both are accepted
   * by addAssetToLibrary — bytes never travel as a string.
   */
  uri: string;
  name: string;
  /** Absent when the platform picker did not report one — see pickAudioNative. */
  size?: number;
  mimeType: string;
  /** Read from metadata on web; native pickers do not report it. */
  durationSeconds?: number;
  /** Web only: release the object URL once the asset has been persisted. */
  release?: () => void;
}

export type PickAudioResult =
  | { status: 'picked'; audio: PickedAudio }
  | { status: 'cancelled' }
  | { status: 'tooLarge'; size: number; limit: number }
  | { status: 'unsupportedType'; mimeType: string };

const EXTENSION_MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
};

/**
 * Android in particular hands back an empty `mimeType` for a file it picked
 * from storage, so the extension is the only thing left to go on.
 */
function mimeTypeForName(name: string, declared?: string | null): string {
  if (declared) return declared;
  const extension = name.toLowerCase().split('.').pop() ?? '';
  return EXTENSION_MIME_TYPES[extension] ?? '';
}

/**
 * Reject before any bytes are read, so an oversized file never hits memory.
 * An unknown size cannot be judged here — the media service re-checks what it
 * actually stored, which is the only measure that cannot be wrong.
 */
function checkFile(size: number | undefined, mimeType: string): PickAudioResult | null {
  if (!isSupportedAudioMimeType(mimeType)) {
    return { status: 'unsupportedType', mimeType: mimeType || 'unknown' };
  }
  if (typeof size === 'number' && size > MAX_AUDIO_ASSET_BYTES) {
    return { status: 'tooLarge', size, limit: MAX_AUDIO_ASSET_BYTES };
  }
  return null;
}

/**
 * Duration comes from the metadata header, so the browser only fetches the
 * start of the file — it never decodes the track.
 */
function readDurationSeconds(objectUrl: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(undefined);
      return;
    }
    const probe = document.createElement('audio');
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

async function pickAudioWeb(): Promise<PickAudioResult> {
  const file = await openWebFileDialog('audio/*,.mp3,.wav,.ogg,.m4a');
  if (!file) return { status: 'cancelled' };

  const mimeType = mimeTypeForName(file.name, file.type);
  const rejected = checkFile(file.size, mimeType);
  if (rejected) return rejected;

  // An object URL hands the Blob to the media service by reference; reading the
  // file into a data URI would copy the whole track through the JS heap.
  const uri = URL.createObjectURL(file);
  return {
    status: 'picked',
    audio: {
      uri,
      name: file.name || 'audio.mp3',
      size: file.size,
      mimeType,
      durationSeconds: await readDurationSeconds(uri),
      release: () => URL.revokeObjectURL(uri),
    },
  };
}

async function pickAudioNative(): Promise<PickAudioResult> {
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return { status: 'cancelled' };

  const asset = result.assets[0];
  const mimeType = mimeTypeForName(asset.name ?? '', asset.mimeType);
  // A picker that reports no size at all is common on Android. Treating that
  // as 0 would wave an oversized file straight through the limit check.
  const size = typeof asset.size === 'number' && Number.isFinite(asset.size) ? asset.size : undefined;
  const rejected = checkFile(size, mimeType);
  if (rejected) return rejected;

  return {
    status: 'picked',
    audio: {
      uri: asset.uri,
      name: asset.name || 'audio.mp3',
      size,
      mimeType,
    },
  };
}

/**
 * Open the platform picker for a sound file and return a reference the media
 * library can persist. Format and size are checked before any bytes are read.
 */
export function pickAudioFromDevice(): Promise<PickAudioResult> {
  return Platform.OS === 'web' ? pickAudioWeb() : pickAudioNative();
}
