import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { StoryManuscriptScene } from '@/lib/editor/story-manuscript';
import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { useI18n } from '@/hooks/use-i18n';

interface StoryManuscriptSidebarProps {
  scenes: StoryManuscriptScene[];
  activeSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
}

export function StoryManuscriptSidebar({
  scenes,
  activeSceneId,
  onSelectScene,
}: StoryManuscriptSidebarProps) {
  const colors = useColors();
  const { t } = useI18n();

  return (
    <View
      style={{
        width: 260,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md }}>
        <Text style={{ ...typeScale.caption, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' }}>
          {t('manuscript.map')}
        </Text>
        <Text style={{ ...typeScale.sectionTitle, color: colors.foreground, marginTop: spacing.xs }}>
          {t('editor.scenes')}
        </Text>
        <Text style={{ ...typeScale.caption, color: colors.muted, marginTop: spacing.xs }}>
          {t('manuscript.mapHint')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.lg }}>
        {scenes.map((scene, index) => {
          const isActive = scene.sceneId === activeSceneId;

          return (
            <Pressable
              key={scene.sceneId}
              onPress={() => onSelectScene(scene.sceneId)}
              style={{
                marginBottom: spacing.xs,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: isActive ? colors.primary : colors.border,
                backgroundColor: isActive ? withAlpha(colors.primary, 0x18 / 255) : colors.background,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={{ ...typeScale.micro, color: isActive ? colors.primary : colors.muted, fontWeight: '700' }}>
                {t('manuscript.sceneIndex', { number: index + 1 })}
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  ...typeScale.label,
                  color: colors.foreground,
                  marginTop: spacing.xs,
                }}
              >
                {scene.sceneName || t('editor.untitledScene')}
              </Text>
              <Text style={{ ...typeScale.caption, color: colors.muted, marginTop: spacing.xs }}>
                {t('manuscript.fragmentCount', { count: scene.blocks.length })}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
