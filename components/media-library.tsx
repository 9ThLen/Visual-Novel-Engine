/**
 * MediaLibrary — reusable asset picker for the scene editor.
 * Assets are persisted in AsyncStorage under the key 'mediaLibrary'.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Image,
  Animated,
  Dimensions,
  Alert,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useColors } from '@/hooks/use-colors';

export type AssetType = 'image' | 'audio';

export interface LibraryAsset {
  id: string;
  type: AssetType;
  uri: string;
  name: string;
  addedAt: number;
}

const STORAGE_KEY = 'mediaLibrary';

export async function getLibraryAssets(): Promise<LibraryAsset[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveLibraryAssets(assets: LibraryAsset[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
}

async function addAssetToLibrary(
  uri: string,
  name: string,
  type: AssetType
): Promise<LibraryAsset> {
  const assets = await getLibraryAssets();

  // Don't duplicate the same URI
  const existing = assets.find((a) => a.uri === uri);
  if (existing) return existing;

  // Copy file to permanent storage
  let permanentUri = uri;
  try {
    if (!FileSystem.documentDirectory) {
      throw new Error('Document directory not available');
    }

    const filename = name || uri.split('/').pop() || `asset-${Date.now()}`;
    const ext = filename.includes('.') ? '' : (type === 'image' ? '.png' : '.mp3');
    const targetPath = `${FileSystem.documentDirectory}media-library/${type}s/${filename}${ext}`;

    // Ensure directory exists
    const dirPath = `${FileSystem.documentDirectory}media-library/${type}s/`;
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });

    // Copy file
    await FileSystem.copyAsync({ from: uri, to: targetPath });
    permanentUri = targetPath;
  } catch (err) {
    console.warn('[MediaLibrary] Failed to copy to permanent storage, using original URI:', err);
    permanentUri = uri;
  }

  const asset: LibraryAsset = {
    id: `asset-${Date.now()}`,
    type,
    uri: permanentUri,
    name,
    addedAt: Date.now()
  };
  await saveLibraryAssets([...assets, asset]);
  return asset;
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  type: AssetType;
  onSelect: (asset: LibraryAsset) => void;
  onClose: () => void;
}

export function MediaLibrary({ visible, type, onSelect, onClose }: Props) {
  const colors = useColors();
  const slideAnim = React.useRef(new Animated.Value(0)).current;
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const { height } = Dimensions.get('window');

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible]);

  useEffect(() => {
    if (visible) loadAssets();
  }, [visible]);

  const loadAssets = async () => {
    const all = await getLibraryAssets();
    setAssets(all.filter((a) => a.type === type));
  };

  const handleAddNew = async () => {
    try {
      if (type === 'image') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
        });
        if (!result.canceled && result.assets[0]) {
          const a = result.assets[0];
          const name = a.fileName ?? a.uri.split('/').pop() ?? 'image';
          const asset = await addAssetToLibrary(a.uri, name, 'image');
          await loadAssets();
          onSelect(asset);
          onClose();
        }
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'audio/*',
          copyToCacheDirectory: true,
        });
        if (!result.canceled && result.assets[0]) {
          const a = result.assets[0];
          const asset = await addAssetToLibrary(a.uri, a.name ?? 'audio', 'audio');
          await loadAssets();
          onSelect(asset);
          onClose();
        }
      }
    } catch { Alert.alert('Error', 'Could not open file picker'); }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Remove from library', 'Remove this asset?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const all = await getLibraryAssets();
          await saveLibraryAssets(all.filter((a) => a.id !== id));
          await loadAssets();
        },
      },
    ]);
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  });

  if (!visible && (slideAnim as any)._value === 0) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { transform: [{ translateY }], zIndex: 300 }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        onPress={onClose}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: height * 0.75,
          backgroundColor: colors.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>
            {type === 'image' ? '🖼 Image Library' : '🎵 Audio Library'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 8,
                opacity: pressed ? 0.8 : 1,
              })}
              onPress={handleAddNew}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>+ Add New</Text>
            </Pressable>
            <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontSize: 22, color: colors.muted }}>✕</Text>
            </Pressable>
          </View>
        </View>

        {/* Grid */}
        {assets.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <Text style={{ color: colors.muted, fontSize: 15 }}>No {type}s in library yet.</Text>
            <Pressable
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 8,
                opacity: pressed ? 0.8 : 1,
              })}
              onPress={handleAddNew}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>
                {type === 'image' ? 'Add Image' : 'Add Audio'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={assets}
            numColumns={type === 'image' ? 3 : 1}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            columnWrapperStyle={type === 'image' ? { gap: 8 } : undefined}
            renderItem={({ item }) =>
              type === 'image' ? (
                <Pressable
                  style={({ pressed }) => ({
                    flex: 1,
                    opacity: pressed ? 0.7 : 1,
                    borderRadius: 8,
                    overflow: 'hidden',
                    borderWidth: 2,
                    borderColor: colors.border,
                  })}
                  onPress={() => { onSelect(item); onClose(); }}
                  onLongPress={() => handleDelete(item.id)}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={{ width: '100%', aspectRatio: 1, backgroundColor: colors.background }}
                    resizeMode="cover"
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.muted,
                      padding: 4,
                      backgroundColor: colors.surface,
                    }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.background,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 4,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  onPress={() => { onSelect(item); onClose(); }}
                  onLongPress={() => handleDelete(item.id)}
                >
                  <Text style={{ fontSize: 20, marginRight: 10 }}>🎵</Text>
                  <Text style={{ flex: 1, color: colors.foreground, fontSize: 13 }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>tap to use</Text>
                </Pressable>
              )
            }
          />
        )}
        <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 11, paddingBottom: 16 }}>
          Long-press to remove from library
        </Text>
      </View>
    </Animated.View>
  );
}

// Export helper so scene-editor can add assets directly
export { addAssetToLibrary };
