/**
 * components/editor/modals/AssetPicker.tsx — Modal for selecting assets
 *
 * Category tabs, search, grid of asset cards with thumbnails.
 * Used for selecting backgrounds, character sprites, music, SFX.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal, FlatList, Image,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { createAudioPlayer } from 'expo-audio';
import { useColors } from '@/hooks/use-colors';
import { useAppStore } from '@/stores/use-app-store';
import { addAssetToLibrary, type LibraryAsset } from '@/lib/media-library-service';
import { resolveAssetUri, resolvePlayableAssetUri } from '@/lib/asset-resolver';
import { useI18n } from '@/lib/i18n';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';

export type AssetCategory = 'backgrounds' | 'characters' | 'sprites' | 'music' | 'sfx' | 'voice' | 'ui';

interface AssetPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (assetId: string) => void;
  category?: AssetCategory;
  multiSelect?: boolean;
}

const CATEGORIES: { key: AssetCategory; labelKey: string; icon: IconSymbolName }[] = [
  { key: 'backgrounds', labelKey: 'asset.backgrounds', icon: 'image' },
  { key: 'characters', labelKey: 'asset.characters', icon: 'character' },
  { key: 'sprites', labelKey: 'asset.sprites', icon: 'sprites' },
  { key: 'music', labelKey: 'asset.music', icon: 'music' },
  { key: 'sfx', labelKey: 'asset.sfx', icon: 'sound' },
  { key: 'voice', labelKey: 'asset.voice', icon: 'voice' },
  { key: 'ui', labelKey: 'asset.ui', icon: 'palette' },
];

export function AssetPicker({
  visible,
  onClose,
  onSelect,
  category: initialCategory = 'backgrounds',
  multiSelect = false,
}: AssetPickerProps) {
  const colors = useColors();
  const { t } = useI18n();
  const mediaLibrary = useAppStore((s) => s.mediaLibrary);
  const [previewAudioId, setPreviewAudioId] = useState<string | null>(null);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const [imageUris, setImageUris] = useState<Record<string, string | number>>({});

  const [activeCategory, setActiveCategory] = useState<AssetCategory>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      playerRef.current?.pause();
      playerRef.current?.remove();
    };
  }, [playerRef]);

  const playAudio = useCallback(async (asset: LibraryAsset) => {
    try {
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current = null;
      }
      if (previewAudioId === asset.id) {
        setPreviewAudioId(null);
        return;
      }
      const playableUri = await resolvePlayableAssetUri(asset.uri);
      if (!playableUri) {
        setPreviewAudioId(null);
        return;
      }
      const player = createAudioPlayer(playableUri);
      playerRef.current = player;
      setPreviewAudioId(asset.id);
      player.play();
    } catch {
      setPreviewAudioId(null);
    }
  }, [previewAudioId, playerRef]);

  const filteredAssets = useMemo(() => {
    let assets = mediaLibrary.filter((a) => {
      switch (activeCategory) {
        case 'backgrounds': return a.type === 'image';
        case 'characters': return a.type === 'image';
        case 'sprites': return a.type === 'image';
        case 'music': return a.type === 'audio';
        case 'sfx': return a.type === 'audio';
        case 'voice': return a.type === 'audio';
        case 'ui': return a.type === 'image';
        default: return true;
      }
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      assets = assets.filter(
        (a) => (a.name?.toLowerCase().includes(q))
      );
    }

    return assets;
  }, [mediaLibrary, activeCategory, searchQuery]);

  useEffect(() => {
    const load = async () => {
      const entries: Record<string, string | number> = {};
      for (const a of filteredAssets) {
        if (a.type === 'image') {
          const resolved = await resolveAssetUri(a.uri);
          if (resolved) entries[a.id] = resolved;
        }
      }
      setImageUris(entries);
    };
    load();
  }, [filteredAssets]);

  const handleSelect = (assetId: string) => {
    if (multiSelect) {
      const newSet = new Set(selectedIds);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      setSelectedIds(newSet);
    } else {
      onSelect(assetId);
      onClose();
    }
  };

  const handleConfirmMulti = () => {
    selectedIds.forEach((id) => onSelect(id));
    onClose();
  };

  const handlePickFromDevice = async () => {
    const isAudio = ['music', 'sfx', 'voice'].includes(activeCategory);
    const result = await DocumentPicker.getDocumentAsync({
      type: isAudio ? ['audio/*'] : ['image/*'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      const file = result.assets[0];
      const name = file.name?.replace(/\.[^/.]+$/, '') || 'Picked asset';
      const asset = await addAssetToLibrary(file.uri, name, isAudio ? 'audio' : 'image');
      handleSelect(asset.id);
    }
  };

  const handlePickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      const file = result.assets[0];
      const name = file.fileName?.replace(/\.[^/.]+$/, '') || 'Gallery image';
      const asset = await addAssetToLibrary(file.uri, name, 'image');
      handleSelect(asset.id);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={{
        flex: 1,
        backgroundColor: colors.backdrop,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <View style={{
          width: '90%',
          maxWidth: 800,
          maxHeight: '80%',
          backgroundColor: colors['surface-container'],
          borderRadius: 12,
          overflow: 'hidden',
          elevation: 8,
          shadowColor: colors['shadow-color'],
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>
              {t('editor.selectAsset')}
            </Text>
            <Pressable onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <IconSymbol name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('editor.searchAssets')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('editor.searchAssets')}
              style={{
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 14,
                color: colors.foreground,
              }}
            />
          </View>

          {/* Category tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 4 }}
          >
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.key}
                onPress={() => {
                  setActiveCategory(cat.key);
                  setPreviewAudioId(null);
                  playerRef.current?.pause();
                  playerRef.current?.remove();
                  playerRef.current = null;
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  marginRight: 6,
                  borderRadius: 8,
                  backgroundColor: activeCategory === cat.key ? colors.primary : colors.background,
                }}
                accessibilityRole="button"
                accessibilityLabel={t(cat.labelKey)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <IconSymbol
                    name={cat.icon}
                    size={14}
                    color={activeCategory === cat.key ? colors['text-inverse'] : colors.foreground}
                  />
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: activeCategory === cat.key ? colors['text-inverse'] : colors.foreground,
                  }}>
                    {t(cat.labelKey)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>

          {/* Asset grid */}
          <FlatList
            data={filteredAssets}
            numColumns={3}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.id);
              const isPlaying = previewAudioId === item.id;
              return (
                <Pressable
                  onPress={() => handleSelect(item.id)}
                  style={{
                    flex: 1,
                    maxWidth: '31%',
                    margin: 4,
                    borderRadius: 8,
                    overflow: 'hidden',
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: colors.background,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.name || item.id}
                >
                  {item.type === 'image' ? (
                    (() => {
                      const imgSrc = imageUris[item.id];
                      return typeof imgSrc === 'number' ? (
                        <Image
                          source={imgSrc}
                          style={{ width: '100%', height: 80 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Image
                          source={{ uri: imgSrc || item.uri }}
                          style={{ width: '100%', height: 80 }}
                          resizeMode="cover"
                        />
                      );
                    })()
                  ) : (
                    <Pressable
                      onPress={() => playAudio(item)}
                      style={{
                        width: '100%',
                        height: 80,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.surface,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={isPlaying ? t('asset.stopPreview') : t('asset.previewAudio')}
                    >
                      <IconSymbol name={isPlaying ? 'stop' : 'play'} size={32} color={colors.primary} />
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                        {isPlaying ? t('common.stop') : t('common.preview')}
                      </Text>
                    </Pressable>
                  )}
                  <View style={{ paddingHorizontal: 6, paddingVertical: 6 }}>
                    <Text
                      style={{ fontSize: 12, color: colors.foreground, fontWeight: '500' }}
                      numberOfLines={1}
                    >
                      {item.name || item.id}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>
                  {t('asset.noAssetsFound')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Pressable
                    onPress={handlePickFromGallery}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: colors.primary,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('editor.selectAsset')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <IconSymbol name="gallery" size={14} color={colors['text-inverse']} />
                      <Text style={{ fontSize: 13, color: colors['text-inverse'], fontWeight: '600' }}>{t('asset.gallery')}</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={handlePickFromDevice}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('editor.selectAsset')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <IconSymbol name="files" size={14} color={colors.foreground} />
                      <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>{t('asset.files')}</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            }
          />

          {/* Footer */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 8,
            flexWrap: 'wrap',
          }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handlePickFromGallery}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: colors.primary,
                }}
                accessibilityRole="button"
                accessibilityLabel={t('editor.selectAsset')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <IconSymbol name="gallery" size={14} color={colors['text-inverse']} />
                  <Text style={{ fontSize: 13, color: colors['text-inverse'], fontWeight: '600' }}>{t('asset.gallery')}</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={handlePickFromDevice}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                accessibilityRole="button"
                accessibilityLabel={t('editor.selectAsset')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <IconSymbol name="files" size={14} color={colors.foreground} />
                  <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>{t('asset.files')}</Text>
                </View>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={onClose}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>
                  {t('common.cancel')}
                </Text>
              </Pressable>
              {multiSelect && selectedIds.size > 0 && (
                <Pressable
                  onPress={handleConfirmMulti}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: colors.primary,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.confirm')}
                >
                  <Text style={{ fontSize: 13, color: colors['text-inverse'], fontWeight: '600' }}>
                    {t('common.select')} ({selectedIds.size})
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
