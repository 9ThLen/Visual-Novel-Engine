/**
 * Handing a finished bundle to the author.
 *
 * Separate from `lib/story-backup/platform-file.ts` because that one streams a
 * backup as it is written and knows the backup's media type. A player bundle is
 * already complete in memory by the time it gets here, and it is an ordinary
 * zip — the thing an author uploads to a static host or emails to a friend.
 */
import { Platform } from 'react-native';

const BUNDLE_MIME = 'application/zip';

type FileSystemFileHandle = {
  createWritable(): Promise<{
    write(data: Uint8Array | Blob): Promise<void>;
    close(): Promise<void>;
  }>;
};

/** True when the author aborted the save dialog rather than something failing. */
function isCancellation(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : (error as { name?: string } | null)?.name === 'AbortError';
}

async function saveWebFile(
  fileName: string,
  data: Uint8Array | Blob,
  mimeType: string,
  description: string,
  extensions: string[],
): Promise<boolean> {
  const picker = (globalThis as typeof globalThis & {
    showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
  }).showSaveFilePicker;

  if (picker) {
    // Where the browser offers it, let the author choose the destination — a
    // bundle is a thing they are about to do something with, not a stray
    // download.
    let handle: FileSystemFileHandle;
    try {
      handle = await picker({
        suggestedName: fileName,
        types: [{ description, accept: { [mimeType]: extensions } }],
      });
    } catch (error) {
      // Closing the dialog is a decision, not a failure. Downloading anyway
      // would override it; reporting an error would call it a fault.
      if (isCancellation(error)) return false;
      throw error;
    }
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return true;
  }

  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

async function saveNative(fileName: string, bytes: Uint8Array): Promise<boolean> {
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(bytes);

  const Sharing = await import('expo-sharing');
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable');
  await Sharing.shareAsync(file.uri, {
    mimeType: BUNDLE_MIME,
    dialogTitle: fileName,
    UTI: 'public.zip-archive',
  });
  return true;
}

/** `false` when the author closed the save dialog without choosing anywhere. */
export async function savePlayerBundle(fileName: string, bytes: Uint8Array): Promise<boolean> {
  if (Platform.OS === 'web') {
    return saveWebFile(fileName, bytes, BUNDLE_MIME, 'Playable web bundle', ['.zip']);
  }
  return saveNative(fileName, bytes);
}

/** Save a completed Android artifact returned by the local build helper. */
export async function saveAndroidBuildArtifact(fileName: string, artifact: Blob): Promise<boolean> {
  if (Platform.OS !== 'web') throw new Error('Android build downloads are only available in the studio web app.');
  const extension = fileName.toLowerCase().endsWith('.aab') ? '.aab' : '.apk';
  const mimeType = extension === '.apk'
    ? 'application/vnd.android.package-archive'
    : 'application/octet-stream';
  return saveWebFile(fileName, artifact, mimeType, 'Android application', [extension]);
}
