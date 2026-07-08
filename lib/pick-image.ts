import { Platform } from 'react-native';
import { openWebFileDialog, readFileAsDataUrl } from './web-file-input';

export interface PickedImage {
  /** data: URI on web, file:// URI on native. Both are accepted by addAssetToLibrary. */
  uri: string;
  name: string;
}

async function pickImageWeb(): Promise<PickedImage | null> {
  const file = await openWebFileDialog('image/*');
  if (!file) return null;
  const uri = await readFileAsDataUrl(file);
  return uri ? { uri, name: file.name } : null;
}

async function pickImageNative(): Promise<PickedImage | null> {
  const ImagePicker = await import('expo-image-picker');
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? `cover-${Date.now()}.png`,
  };
}

/**
 * Open the platform image picker and return the selected image as a URI that
 * addAssetToLibrary can persist. Resolves null when the user cancels or denies
 * permission.
 */
export function pickImageFromDevice(): Promise<PickedImage | null> {
  return Platform.OS === 'web' ? pickImageWeb() : pickImageNative();
}
