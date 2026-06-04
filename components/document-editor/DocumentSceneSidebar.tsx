import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import type { SceneRecord } from '@/lib/engine/types';

interface DocumentSceneSidebarProps {
  activeSceneId: string;
  scenes: SceneRecord[];
  onScenePress: (sceneId: string) => void;
}

export function DocumentSceneSidebar({ activeSceneId, scenes, onScenePress }: DocumentSceneSidebarProps) {
  const colors = useColors();
  const { t } = useI18n();

  return (
    <View style={{ width: 250, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, padding: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{t('editor.scenes')}</Text>
      <ScrollView style={{ marginTop: 12 }}>
        {scenes.map((scene) => (
          <Pressable
            key={scene.id}
            onPress={() => onScenePress(scene.id)}
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: scene.id === activeSceneId ? colors.primary : colors.border,
              backgroundColor: scene.id === activeSceneId ? `${colors.primary}12` : colors.background,
              padding: 10,
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
