import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { requestMediaLibraryPermissionsAsync } from 'expo-image-picker';
import { useFilePicker } from './use-file-picker';
import { addAssetToLibrary } from '@/lib/media-library-service';

export function useSceneEditorMedia() {
  const [libraryTarget, setLibraryTarget] = useState<string | null>(null);
  const { pickFiles: pickImage } = useFilePicker({ type: 'image' });
  const { pickFiles: pickAudio } = useFilePicker({ type: 'audio' });

  const handlePickBg = useCallback(async (onSelect: (uri: string) => void) => {
    try {
      const { status } = await requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photos');
        return;
      }

      const files = await pickImage();
      if (!files[0]) return;

      const asset = await addAssetToLibrary(files[0].uri, files[0].name, 'image');
      onSelect(asset.uri);

      if (asset.uri.includes('media-library')) {
        Alert.alert('Success', 'Image added and saved to library! Don\'t forget to Save.');
      } else {
        Alert.alert('Warning', 'Image added but may not persist after reload.');
      }
    } catch (error) {
      if (__DEV__) console.error('[useSceneEditorMedia] Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  }, [pickImage]);

  const handlePickAudio = useCallback(async (target: 'voice' | 'music', onSelect: (uri: string) => void) => {
    try {
      const files = await pickAudio();
      if (!files[0]) return;

      const asset = await addAssetToLibrary(files[0].uri, files[0].name, 'audio');
      onSelect(asset.uri);

      const label = target === 'voice' ? 'Voice audio' : 'Background music';
      if (asset.uri.includes('media-library')) {
        Alert.alert('Success', `${label} added and saved to library! Don't forget to Save.`);
      } else {
        Alert.alert('Warning', `${label} added but may not persist after reload.`);
      }
    } catch (error) {
      if (__DEV__) console.error('[useSceneEditorMedia] Error picking audio:', error);
      Alert.alert('Error', 'Failed to pick audio file');
    }
  }, [pickAudio]);

  return {
    libraryTarget,
    setLibraryTarget,
    handlePickBg,
    handlePickAudio,
  };
}
