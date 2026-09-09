import { Platform, Share } from 'react-native';

/**
 * Turn a story title into a safe file base name: ASCII-ish, no path separators,
 * length-capped. Falls back to "story" when nothing usable remains.
 */
export function toExportFilename(title: string): string {
  const base = (title || '')
    .trim()
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return `${base || 'story'}.json`;
}

function downloadWeb(filename: string, json: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveNative(filename: string, json: string): Promise<void> {
  const FileSystem = await import('expo-file-system/legacy');
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('No writable directory available');
  const path = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(path, json);

  // Prefer expo-sharing: it hands the OS the file itself (a content:// URI on
  // Android), so "Save to Files"/"Download" targets receive real JSON. RN Share
  // on Android only carries a text `message`, which would share the path string
  // rather than the file — so it is used only as a last-resort fallback.
  const Sharing = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/json',
      dialogTitle: filename,
      UTI: 'public.json',
    });
    return;
  }

  await Share.share(
    Platform.OS === 'ios'
      ? { url: path, title: filename }
      : { message: path, title: filename },
  );
}

/**
 * Persist an exported story JSON string to the device. On web this triggers a
 * browser download; on native it writes the file then opens the OS share sheet
 * (via expo-sharing) so it can be saved locally or sent elsewhere.
 */
export async function saveStoryExport(title: string, json: string): Promise<void> {
  const filename = toExportFilename(title);
  if (Platform.OS === 'web') {
    downloadWeb(filename, json);
    return;
  }
  await saveNative(filename, json);
}
