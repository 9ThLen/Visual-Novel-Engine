import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { addAssetToLibrary, LibraryAsset } from '@/components/media-library';

export function useSceneEditorMedia() {
  const [libraryTarget, setLibraryTarget] = useState<'bg' | 'voice' | 'music' | null>(null);

  const handlePickBg = useCallback(async (onSelect: (uri: string) => void) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        const name = result.assets[0].fileName ?? uri.split('/').pop() ?? 'image';
        const asset = await addAssetToLibrary(uri, name, 'image');
        onSelect(asset.uri);
        
        if (asset.uri.includes('media-library')) {
          Alert.alert('Success', 'Image added and saved to library! Don\'t forget to Save.');
        } else {
          Alert.alert('Warning', 'Image added but may not persist after reload.');
        }
      }
    } catch (error) {
      console.error('[useSceneEditorMedia] Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  }, []);

  const handlePickAudio = useCallback(async (target: 'voice' | 'music', onSelect: (uri: string) => void) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-wav'],
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets[0]) {
        const { uri, name } = result.assets[0];
        const asset = await addAssetToLibrary(uri, name ?? 'audio', 'audio');
        onSelect(asset.uri);

        const label = target === 'voice' ? 'Voice audio' : 'Background music';
        if (asset.uri.includes('media-library')) {
          Alert.alert('Success', `${label} added and saved to library! Don't forget to Save.`);
        } else {
          Alert.alert('Warning', `${label} added but may not persist after reload.`);
        }
      }
    } catch (error) {
      console.error('[useSceneEditorMedia] Error picking audio:', error);
      Alert.alert('Error', 'Failed to pick audio file');
    }
  }, []);

  return {
    libraryTarget,
    setLibraryTarget,
    handlePickBg,
    handlePickAudio,
  };
}
