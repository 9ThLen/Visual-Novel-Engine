import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { cn } from '@/lib/utils';
import { useColors } from '@/hooks/use-colors';

interface ViewModeTabsProps {
  viewMode: 'canvas' | 'flow';
  setViewMode: (mode: 'canvas' | 'flow') => void;
  className?: string;
}

export function ViewModeTabs({ viewMode, setViewMode, className }: ViewModeTabsProps) {
  const colors = useColors();
  return (
    <View
      className={cn('flex-row rounded-lg p-0.5', className)}
      style={{ backgroundColor: colors.surface }}
    >
      <Pressable
        style={({ pressed }) => ({
          flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center',
          backgroundColor: viewMode === 'flow' ? colors.primary : 'transparent',
          opacity: pressed ? 0.8 : 1,
        })}
        onPress={() => setViewMode('flow')}
      >
        <Text style={{
          fontSize: 12, fontWeight: 'bold',
          color: viewMode === 'flow' ? '#fff' : colors.muted,
        }}>
          🧱 Блоки
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => ({
          flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center',
          backgroundColor: viewMode === 'canvas' ? colors.primary : 'transparent',
          opacity: pressed ? 0.8 : 1,
        })}
        onPress={() => setViewMode('canvas')}
      >
        <Text style={{
          fontSize: 12, fontWeight: 'bold',
          color: viewMode === 'canvas' ? '#fff' : colors.muted,
        }}>
          🎬 Превью
        </Text>
      </Pressable>
    </View>
  );
}
