import { Platform } from 'react-native';
import { openWebFileDialog, readFileAsText } from './web-file-input';

async function pickJsonWeb(): Promise<string | null> {
  const file = await openWebFileDialog('application/json,.json');
  if (!file) return null;
  return readFileAsText(file);
}

async function pickJsonNative(): Promise<string | null> {
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const FileSystem = await import('expo-file-system/legacy');
  return FileSystem.readAsStringAsync(result.assets[0].uri);
}

/**
 * Open the platform file picker for a story `.json` file and return its text
 * contents. Resolves null when the user cancels.
 */
export function pickStoryFile(): Promise<string | null> {
  return Platform.OS === 'web' ? pickJsonWeb() : pickJsonNative();
}
