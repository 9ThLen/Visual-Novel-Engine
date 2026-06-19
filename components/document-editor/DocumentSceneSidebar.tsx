import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/lib/_core/theme';
import { useI18n } from '@/hooks/use-i18n';
import type { SceneRecord } from '@/lib/engine/types';
import type { ColorScheme } from '@/constants/theme';

interface DocumentSceneSidebarProps {
  activeSceneId: string;
  colorScheme?: ColorScheme;
  scenes: SceneRecord[];
  onScenePress: (sceneId: string) => void;
}

export function DocumentSceneSidebar({ activeSceneId, colorScheme, scenes, onScenePress }: DocumentSceneSidebarProps) {
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
            <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>{scene.name || t('document.untitledScene')}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{t('document.blockCount', { count: scene.timeline.length })}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
