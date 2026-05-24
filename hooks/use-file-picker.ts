import { Platform } from 'react-native';
import * as ExpoImagePicker from 'expo-image-picker';
import * as ExpoDocumentPicker from 'expo-document-picker';
import { useCallback } from 'react';

export type FilePickerType = 'image' | 'audio';

export interface PickedFile {
  uri: string;
  name: string;
  type?: string;
  size?: number;
}

export interface ImagePickerAPI {
  launchImageLibraryAsync(options: {
    mediaTypes: string[];
    quality: number;
    allowsMultipleSelection: boolean;
  }): Promise<{
    canceled: boolean;
    assets: {
      uri: string;
      fileName?: string | null;
      type?: string;
      fileSize?: number;
    }[];
  }>;
}

export interface DocumentPickerAPI {
  getDocumentAsync(options: {
    type: string;
    copyToCacheDirectory: boolean;
    multiple: boolean;
  }): Promise<{
    canceled: boolean;
    assets: {
      uri: string;
      name?: string | null;
      mimeType?: string;
      size?: number;
    }[];
  }>;
}

export interface UseFilePickerOptions {
  type: FilePickerType;
  multiple?: boolean;
  maxSize?: number;
  onError?: (error: string) => void;
  imagePicker?: ImagePickerAPI;
  documentPicker?: DocumentPickerAPI;
}

export function useFilePicker({
  type,
  multiple = false,
  maxSize,
  onError,
  imagePicker = ExpoImagePicker as unknown as ImagePickerAPI,
  documentPicker = ExpoDocumentPicker as unknown as DocumentPickerAPI,
}: UseFilePickerOptions) {
  const pickImage = useCallback(async (): Promise<PickedFile[]> => {
    try {
      const result = await imagePicker.launchImageLibraryAsync({
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
        type: asset.type && typeof asset.type === 'string' && asset.type.startsWith('image/') ? asset.type : asset.type,
        size: asset.fileSize,
      }));
    } catch (error) {
      if (onError) {
        onError('Failed to pick image');
      }
      return [];
    }
  }, [multiple, onError, imagePicker]);

  const pickAudio = useCallback(async (): Promise<PickedFile[]> => {
    try {
      const result = await documentPicker.getDocumentAsync({
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
  }, [multiple, onError, documentPicker]);

  const pickFiles = useCallback(async (): Promise<PickedFile[]> => {
    if (type === 'image') {
      return pickImage();
    } else {
      return pickAudio();
    }
  }, [type, pickImage, pickAudio]);

  return {
    pickFiles,
    isWeb: Platform.OS === 'web',
  };
}
