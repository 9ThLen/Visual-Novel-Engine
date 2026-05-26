import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { StoryManuscriptScene } from '@/lib/editor/story-manuscript';
import { useColors } from '@/hooks/use-colors';

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

  return (
    <View
      style={{
        width: 260,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' }}>
          Manuscript Map
        </Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground, marginTop: 6 }}>
          Scenes
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
          Швидкий перехід між секціями історії.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 16 }}>
        {scenes.map((scene, index) => {
          const isActive = scene.sceneId === activeSceneId;

          return (
            <Pressable
              key={scene.sceneId}
              onPress={() => onSelectScene(scene.sceneId)}
              style={{
                marginBottom: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: isActive ? colors.primary : colors.border,
                backgroundColor: isActive ? `${colors.primary}18` : colors.background,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 11, color: isActive ? colors.primary : colors.muted, fontWeight: '700' }}>
                Scene {index + 1}
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors.foreground,
                  marginTop: 4,
                }}
              >
                {scene.sceneName || 'Untitled Scene'}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>
                {scene.blocks.length} fragments
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
