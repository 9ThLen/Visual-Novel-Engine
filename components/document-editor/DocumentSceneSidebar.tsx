import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/lib/_core/theme';
import { useI18n } from '@/hooks/use-i18n';
import { resolveAssetUri } from '@/lib/asset-resolver';
import type { BackgroundBlockData, SceneRecord } from '@/lib/engine/types';
import type { ColorScheme } from '@/constants/theme';

interface DocumentSceneSidebarProps {
  activeSceneId: string;
  colorScheme?: ColorScheme;
  dirtySceneIds?: Set<string>;
  scenes: SceneRecord[];
  onScenePress: (sceneId: string) => void;
}

export function DocumentSceneSidebar({ activeSceneId, colorScheme, dirtySceneIds, scenes, onScenePress }: DocumentSceneSidebarProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();

  return (
    <View style={{ width: 286, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors['surface-1'], padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '800' }}>{t('editor.scenes')}</Text>
        <Text style={{ color: colors.muted, fontSize: 18, fontWeight: '600' }}>+</Text>
      </View>
      <ScrollView style={{ marginTop: 12 }}>
        {scenes.map((scene) => (
          <Pressable
            key={scene.id}
            onPress={() => onScenePress(scene.id)}
            style={{
              borderRadius: 7,
              borderWidth: 0,
              borderColor: scene.id === activeSceneId ? colors.primary : colors.border,
              backgroundColor: scene.id === activeSceneId ? withAlpha(colors.primary, 0.12) : 'transparent',
              paddingHorizontal: 12,
              paddingVertical: 11,
              marginBottom: 8,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <SceneThumbnail scene={scene} colorScheme={colorScheme} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                  {dirtySceneIds?.has(scene.id) ? '* ' : ''}{scene.name || t('document.untitledScene')}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                  {t('document.blockCount', { count: scene.timeline.length })}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function getSceneBackgroundAssetId(scene: SceneRecord): string | null {
  const background = scene.timeline.find((step) => step.enabled && step.blockType === 'background');
  if (!background) return null;
  return ((background.data as BackgroundBlockData).assetId ?? null);
}

function SceneThumbnail({ scene, colorScheme }: { scene: SceneRecord; colorScheme?: ColorScheme }) {
  const colors = useColors(colorScheme);
  const [source, setSource] = useState<number | { uri: string } | null>(null);
  const assetId = getSceneBackgroundAssetId(scene);

  useEffect(() => {
    let active = true;
    if (!assetId) {
      setSource(null);
      return () => {
        active = false;
      };
    }

    resolveAssetUri(assetId)
      .then((resolved) => {
        if (!active) return;
        setSource(resolved ? (typeof resolved === 'number' ? resolved : { uri: resolved }) : null);
      })
      .catch(() => {
        if (active) setSource(null);
      });

    return () => {
      active = false;
    };
  }, [assetId]);

  return (
    <View style={{ width: 58, height: 38, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.background }}>
      {source ? (
        <Image source={source} style={{ flex: 1 }} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={{ flex: 1, backgroundColor: withAlpha(colors.primary, 0.14) }} />
      )}
    </View>
  );
}
