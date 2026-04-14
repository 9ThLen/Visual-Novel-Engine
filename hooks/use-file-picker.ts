/**
 * Platform-aware file picker hook
 * Uses native pickers on mobile, web picker on web
 */

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useState, useCallback } from 'react';

export type FilePickerType = 'image' | 'audio';

export interface PickedFile {
  uri: string;
  name: string;
  type?: string;
  size?: number;
}

export interface UseFilePickerOptions {
  type: FilePickerType;
  multiple?: boolean;
  maxSize?: number;
  onError?: (error: string) => void;
}

export function useFilePicker({ type, multiple = false, maxSize, onError }: UseFilePickerOptions) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const pickImage = useCallback(async (): Promise<PickedFile[]> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsMultipleSelection: multiple,
      });

      if (result.canceled) {
        return [];
      }

      return result.assets.map(asset => ({
        uri: asset.uri,
        name: asset.fileName ?? asset.uri.split('/').pop() ?? 'image',
        type: asset.type === 'image' ? 'image/jpeg' : undefined,
        size: asset.fileSize,
      }));
    } catch (error) {
      if (onError) {
        onError('Failed to pick image');
      }
      return [];
    }
  }, [multiple, onError]);

  const pickAudio = useCallback(async (): Promise<PickedFile[]> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple,
      });

      if (result.canceled) {
        return [];
      }

      return result.assets.map(asset => ({
        uri: asset.uri,
        name: asset.name ?? 'audio',
        type: asset.mimeType,
        size: asset.size,
      }));
    } catch (error) {
      if (onError) {
        onError('Failed to pick audio');
      }
      return [];
    }
  }, [multiple, onError]);

  const pickFiles = useCallback(async (): Promise<PickedFile[]> => {
    if (type === 'image') {
      return pickImage();
    } else {
      return pickAudio();
    }
  }, [type, pickImage, pickAudio]);

  // For web, we'll use a different approach with WebFilePicker component
  // This hook is primarily for native platforms
  const openPicker = useCallback(() => {
    if (Platform.OS === 'web') {
      setIsPickerVisible(true);
    } else {
      pickFiles();
    }
  }, [pickFiles]);

  const closePicker = useCallback(() => {
    setIsPickerVisible(false);
  }, []);

  const handleWebFiles = useCallback((files: PickedFile[]) => {
    setIsPickerVisible(false);
    return files;
  }, []);

  return {
    pickFiles,
    openPicker,
    closePicker,
    handleWebFiles,
    isPickerVisible,
    isWeb: Platform.OS === 'web',
  };
}
