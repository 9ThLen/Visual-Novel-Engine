import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

interface NativeEditorToolbarProps {
  onInsert: (template: string) => void;
  onCreateNextScene?: () => void;
}

const templates = [
  { label: 'Персонаж', value: 'Персонаж: репліка' },
  { label: 'Фон', value: '[background asset_id]' },
  { label: 'Звук', value: '[play sfx asset_id]' },
  { label: 'Музика', value: '[play music asset_id loop volume=0.8]' },
  { label: 'Вибір', value: '[choice Що зробити? | Варіант 1 | Варіант 2]' },
  { label: 'Команда', value: '[command]' },
];

export function NativeEditorToolbar({ onInsert, onCreateNextScene }: NativeEditorToolbarProps) {
  return (
    <View style={{ borderBottomColor: '#E5E7EB', borderBottomWidth: 1, paddingVertical: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {templates.map((template) => (
          <Pressable
            key={template.label}
            accessibilityRole="button"
            onPress={() => onInsert(template.value)}
            style={{
              minHeight: 36,
              justifyContent: 'center',
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: '#111827',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>{template.label}</Text>
          </Pressable>
        ))}
        {onCreateNextScene ? (
          <Pressable
            accessibilityRole="button"
            onPress={onCreateNextScene}
            style={{
              minHeight: 36,
              justifyContent: 'center',
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: '#047857',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>New Scene</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
