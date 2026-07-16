import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ColorScheme } from '@/constants/theme';
import type { AiImageResult } from '@/lib/ai/image-tools';
import { addAssetToLibrary } from '@/stores/media-library-actions';
import { useAppStore } from '@/stores/use-app-store';
import type { LibraryAsset } from '@/lib/media-library-service';

interface ImageResultCardProps {
  result: AiImageResult;
  storyId: string;
  colorScheme?: ColorScheme;
  onImported: (assetId: string) => void;
  onDiscard: () => void;
  importAsset?: (uri: string, name: string, type: 'image') => Promise<LibraryAsset>;
}

export function ImageResultCard({ result, storyId, colorScheme, onImported, onDiscard, importAsset = addAssetToLibrary }: ImageResultCardProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const [importing, setImporting] = useState(false);
  const [assetId, setAssetId] = useState(result.assetId);

  useEffect(() => () => URL.revokeObjectURL(result.blobUrl), [result.blobUrl]);

  const importImage = async () => {
    if (importing || assetId) return;
    setImporting(true);
    try {
      const extension = result.mimeType === 'image/webp' ? 'webp' : result.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const asset = await importAsset(result.blobUrl, `ai-image-${result.requestId}.${extension}`, 'image');
      useAppStore.getState().addImageAssetToStory(storyId, asset.id);
      setAssetId(asset.id);
      onImported(asset.id);
    } finally {
      setImporting(false);
    }
  };

  const cost = result.estimatedCostUsd == null
    ? null
    : typeof result.estimatedCostUsd === 'object'
      ? JSON.stringify(result.estimatedCostUsd)
      : String(result.estimatedCostUsd);

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, gap: 8, backgroundColor: colors.surface }}>
      <Image accessibilityLabel={t('aiChat.images.preview')} source={{ uri: result.blobUrl }} style={{ width: '100%', height: 180, borderRadius: 8 }} resizeMode="contain" />
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>{result.prompt || t('aiChat.images.result')}</Text>
      <Text style={{ color: colors.muted, fontSize: 11 }}>
        {result.purpose} · {Math.ceil(result.blob.size / 1024)} KB{result.width && result.height ? ` · ${result.width}×${result.height}` : ''}{cost ? ` · ${t('aiChat.images.cost', { cost })}` : ''}
      </Text>
      {assetId ? <Text style={{ color: colors.primary, fontSize: 11 }}>{t('aiChat.images.added', { assetId })}</Text> : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={importImage} disabled={importing} style={{ paddingHorizontal: 10, minHeight: 34, justifyContent: 'center', borderRadius: 8, backgroundColor: colors.primary }}>
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>{importing ? t('aiChat.images.importing') : t('aiChat.images.add')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDiscard} style={{ paddingHorizontal: 10, minHeight: 34, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 12 }}>{t('aiChat.images.discard')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
