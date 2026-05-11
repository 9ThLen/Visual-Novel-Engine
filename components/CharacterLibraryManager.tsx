import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useCharacterLibrary } from '@/hooks/use-character-library';
import type { Character, CharacterSprite } from '@/lib/character-types';
import { CharacterPanel } from './character-library/CharacterPanel';
import { SpriteGallery } from './character-library/SpriteGallery';
import { SpriteEditModal } from './character-library/SpriteEditModal';
import { TextInputModal } from './character-library/TextInputModal';

interface Props {
  storyId: string;
  visible: boolean;
  onClose: () => void;
  onSelectCharacter?: (character: Character) => void;
  onSelectSprite?: (character: Character, sprite: CharacterSprite) => void;
}

export function CharacterLibraryManager({
  storyId,
  visible,
  onClose,
  onSelectCharacter,
  onSelectSprite,
}: Props) {
  const colors = useColors();
  const {
    filteredCharacters,
    selectedCharacter,
    searchQuery,
    setSearchQuery,
    editingSprite,
    setEditingSprite,
    inputModal,
    setInputModal,
    isLoading,
    actions,
    setSelectedCharId,
  } = useCharacterLibrary(storyId, visible);

  if (!visible) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Character Library
          </Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: colors.muted }]}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <CharacterPanel
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isLoading={isLoading}
            filteredCharacters={filteredCharacters}
            selectedCharacter={selectedCharacter}
            handleSelectChar={(char) => {
              setSelectedCharId(char.id);
              onSelectCharacter?.(char);
            }}
            handleDeleteCharacter={actions.deleteCharacter}
            handleAddCharacter={actions.addCharacter}
            colors={colors}
          />

          <View style={styles.rightPanel}>
            {selectedCharacter ? (
              <SpriteGallery
                selectedCharacter={selectedCharacter}
                colors={colors}
                onAddSprite={actions.addSprite}
                onEditSprite={setEditingSprite}
                onDeleteSprite={actions.deleteSprite}
                onSelectSprite={onSelectSprite}
                onClose={onClose}
              />
            ) : (
              <View style={styles.noSelection}>
                <Text style={[styles.noSelectionText, { color: colors.muted }]}>
                  Select a character to view sprites
                </Text>
              </View>
            )}
          </View>
        </View>

        {editingSprite && (
          <SpriteEditModal
            editingSprite={editingSprite}
            setEditingSprite={setEditingSprite}
            onSave={actions.saveSprite}
            colors={colors}
          />
        )}

        {inputModal && (
          <TextInputModal
            visible={!!inputModal}
            title={inputModal.title}
            message={inputModal.message}
            defaultValue={inputModal.defaultValue}
            onSave={actions.handleInputSave}
            onCancel={() => setInputModal(null)}
            colors={colors}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    width: '90%',
    maxWidth: 800,
    height: '80%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 24,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  rightPanel: {
    flex: 1,
    padding: 12,
  },
  noSelection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noSelectionText: {
    fontSize: 14,
  },
});
