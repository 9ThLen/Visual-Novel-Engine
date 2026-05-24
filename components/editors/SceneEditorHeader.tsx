import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LanguageSelector } from '@/components/LanguageSelector';
import { useColors } from '@/hooks/use-colors';

interface SceneEditorHeaderProps {
  sceneId: string;
  onSave: () => void;
  onBack: () => void;
  compact?: boolean;
}

export function SceneEditorHeader({ sceneId, onSave, onBack, compact }: SceneEditorHeaderProps) {
  const colors = useColors();
  return (
    <View className="flex-row justify-between items-center mb-2">
      <View className="flex-1 mr-2">
        <Text style={[{ color: colors.foreground, fontWeight: 'bold' }, { fontSize: 16 }]} numberOfLines={1}>
          🧱 Scene Editor
        </Text>
        <Text style={[{ color: colors.primary, fontWeight: '600' }, { fontSize: 12 }]} numberOfLines={1}>
          {sceneId}
        </Text>
      </View>
      <View className="flex-row gap-1.5 items-center flex-shrink">
        <LanguageSelector style={{ flex: 0 }} />
        <Pressable
          style={({ pressed }) => ({
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.primary,
            opacity: pressed ? 0.8 : 1,
          })}
          onPress={onSave}
        >
          <Text style={[{ color: '#fff' }, { fontSize: compact ? 12 : 14, fontWeight: 'bold' }]}>
            {compact ? '💾' : '💾 Save'}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => ({
            paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
          onPress={onBack}
        >
          <Text style={[{ color: colors.primary, fontWeight: '600' }, { fontSize: compact ? 12 : 14 }]}>
            {compact ? '←' : 'Back'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
