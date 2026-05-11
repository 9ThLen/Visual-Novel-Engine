import React from 'react';
import { View, TextInput, Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { Character } from '@/lib/character-types';
import { CharacterList } from '../CharacterList';

interface CharacterPanelProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isLoading: boolean;
  filteredCharacters: Character[];
  selectedCharacter: Character | null;
  handleSelectChar: (char: Character) => void;
  handleDeleteCharacter: (id: string) => void;
  handleAddCharacter: () => void;
  colors: any;
}

export const CharacterPanel = ({
  searchQuery,
  setSearchQuery,
  isLoading,
  filteredCharacters,
  selectedCharacter,
  handleSelectChar,
  handleDeleteCharacter,
  handleAddCharacter,
  colors,
}: CharacterPanelProps) => {
  return (
    <View style={[styles.leftPanel, { borderRightColor: colors.border }]}>
      <TextInput
        style={[
          styles.searchInput,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
        placeholder="Search characters..."
        placeholderTextColor={colors.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <CharacterList
          characters={filteredCharacters}
          selectedCharacter={selectedCharacter}
          onSelect={handleSelectChar}
          onDelete={handleDeleteCharacter}
        />
      )}

      <Pressable
        style={[
          styles.addButton,
          { backgroundColor: colors.primary },
          isLoading && { opacity: 0.5 },
        ]}
        onPress={handleAddCharacter}
        disabled={isLoading}
      >
        <Text style={styles.addButtonText}>+ Add Character</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  leftPanel: {
    width: '40%',
    borderRightWidth: 1,
    padding: 12,
  },
  searchInput: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
