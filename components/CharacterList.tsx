/**
 * CharacterList - extracted from CharacterLibraryManager
 * Displays filtered list of characters with selection and delete
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import type { Character } from '@/lib/character-types';
import { useColors } from '@/hooks/use-colors';

interface CharacterListProps {
  characters: Character[];
  selectedCharacter: Character | null;
  onSelect: (char: Character) => void;
  onDelete: (id: string) => void;
  colors: ReturnType<typeof useColors>;
}

export function CharacterList({
  characters,
  selectedCharacter,
  onSelect,
  onDelete,
}: CharacterListProps) {
  const colors = useColors();

  if (characters.length === 0) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: colors.muted }}>No characters</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      {characters.map((char) => (
        <Pressable
          key={char.id}
          style={[
            {
              padding: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            },
            selectedCharacter?.id === char.id && {
              backgroundColor: colors.primary,
            },
          ]}
          onPress={() => onSelect(char)}
        >
          <View>
            <Text
              style={[
                { fontWeight: '600' },
                { color: selectedCharacter?.id === char.id ? '#fff' : colors.foreground },
              ]}
            >
              {char.name}
            </Text>
            <Text
              style={[
                { fontSize: 12 },
                { color: selectedCharacter?.id === char.id ? '#fff' : colors.muted },
              ]}
            >
              {char.sprites.length} sprites
            </Text>
          </View>
          <Pressable
            style={{ padding: 8 }}
            onPress={() => onDelete(char.id)}
          >
            <Text style={{ color: colors.error }}>🗑</Text>
          </Pressable>
        </Pressable>
      ))}
    </ScrollView>
  );
}
