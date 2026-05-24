import React from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import type { Choice } from '@/lib/types';

interface ChoiceEditorProps {
  choices: Choice[];
  sceneList: string[];
  onAddChoice: (text: string, targetSceneId: string) => void;
  onDeleteChoice: (id: string) => void;
  onNavigateToScene: (sceneId: string) => void;
}

export function ChoiceEditor({
  choices,
  sceneList,
  onAddChoice,
  onDeleteChoice,
  onNavigateToScene,
}: ChoiceEditorProps) {
  const colors = useColors();
  const [newChoiceText, setNewChoiceText] = React.useState('');
  const [newChoiceTarget, setNewChoiceTarget] = React.useState('');

  return (
    <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1 }]}>
      <Text style={[{ color: colors.foreground }, { fontSize: 14, fontWeight: 'bold', marginBottom: 12 }]}>
        Choices ({choices.length})
      </Text>

      {choices.map((choice) => (
        <View key={choice.id} style={[{ backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1 }]}>
          <View className="flex-row justify-between items-start">
            <View className="flex-1">
              <Text style={[{ color: colors.foreground }, { fontSize: 14, marginBottom: 2 }]}>{choice.text}</Text>
              <Pressable onPress={() => onNavigateToScene(choice.nextSceneId)} accessibilityLabel={`Navigate to scene ${choice.nextSceneId}`}>
                <Text style={[{ color: colors.primary }, { fontSize: 12, fontWeight: '600' }]}>→ {choice.nextSceneId}</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => onDeleteChoice(choice.id)}
              style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.75: 1 })}
              accessibilityLabel={`Delete choice ${choice.text}`}
            >
              <Text style={[{ color: colors.error }, { fontSize: 12, fontWeight: '600' }]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <TextInput
          style={[{ backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: 6, padding: 8, fontSize: 14, marginBottom: 8, borderWidth: 1 }]}
          placeholder="Choice text..."
          placeholderTextColor={colors.muted}
          value={newChoiceText}
          onChangeText={setNewChoiceText}
        />
        <Text style={[{ color: colors.muted }, { fontSize: 12, marginBottom: 4 }]}>Target scene:</Text>
        <View style={[{ backgroundColor: colors.background, borderColor: colors.border, borderRadius: 6, borderWidth: 1, marginBottom: 8, maxHeight: 110, overflow: 'hidden' }]}>
          {sceneList.map((item) => (
            <Pressable
              key={item}
              style={{
                paddingHorizontal: 8, paddingVertical: 6,
                backgroundColor: newChoiceTarget === item ? colors.primary : 'transparent',
              }}
              onPress={() => setNewChoiceTarget(item)}
            >
              <Text style={[{ color: newChoiceTarget === item ? '#fff' : colors.foreground }, { fontSize: 12 }]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => ({
            backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 8,
            alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
          onPress={() => {
            if (newChoiceText.trim() && newChoiceTarget.trim()) {
              onAddChoice(newChoiceText, newChoiceTarget);
              setNewChoiceText('');
              setNewChoiceTarget('');
            }
          }}
        >
          <Text style={[{ color: '#fff' }, { fontSize: 14, fontWeight: '600', textAlign: 'center' }]}>+ Add Choice</Text>
        </Pressable>
      </View>
    </View>
  );
}