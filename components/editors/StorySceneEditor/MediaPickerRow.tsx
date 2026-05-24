import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useColors } from '@/hooks/use-colors';

interface MediaPickerRowProps {
  label: string;
  value: string;
  onPick: () => void;
  onLibrary: () => void;
  onClear?: () => void;
  isImage?: boolean;
}

export function MediaPickerRow({
  label,
  value,
  onPick,
  onLibrary,
  onClear,
  isImage = false,
}: MediaPickerRowProps) {
  const colors = useColors();
  return (
    <View className="mb-4">
      <Text style={[{ color: colors.muted }, { fontSize: 12, fontWeight: '600', marginBottom: 6 }]}>{label}</Text>
      {isImage && value ? (
        <View style={[{ backgroundColor: colors.surface, borderRadius: 8, marginBottom: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', width: '100%', height: 112 }]}>
          <Text style={[{ color: colors.muted }, { fontSize: 12 }]} numberOfLines={1}>{value.split('/').pop()}</Text>
        </View>
      ) : null}
      <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 6, padding: 10, marginBottom: 8, borderWidth: 1 }]}>
        <Text
          style={[{ color: value ? colors.foreground : colors.muted }, { fontSize: 14 }]}
          numberOfLines={1}
        >
          {value ? value.split('/').pop() : 'No file selected'}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <Pressable
          onPress={onPick}
          style={({ pressed }) => ({
            flex: 1, backgroundColor: colors.primary,
            paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8,
            marginRight: 8, alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={[{ color: '#fff' }, { fontSize: 14, fontWeight: '600' }]}>
            {isImage ? '📂 Pick Image' : '🎤 Pick Audio'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onLibrary}
          style={({ pressed }) => ({
            flex: 1, backgroundColor: colors.surface,
            paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: colors.border,
            marginRight: value ? 8 : 0,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={[{ color: colors.foreground }, { fontSize: 14, fontWeight: '600' }]}>🗂 Library</Text>
        </Pressable>
        {value && onClear ? (
          <Pressable
            onPress={onClear}
            style={({ pressed }) => ({
              paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: colors.error,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={[{ color: colors.error }, { fontSize: 16, fontWeight: '600' }]}>✕</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}