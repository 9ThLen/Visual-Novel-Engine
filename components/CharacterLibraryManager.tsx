/**
 * Character Library Manager Component
 * UI for managing story-specific character library
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  StyleSheet,
  Image,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useColors } from '@/hooks/use-colors';
import type { Character, CharacterSprite } from '@/lib/character-types';
import * as characterLibrary from '@/lib/character-library';

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
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingSprite, setEditingSprite] = useState<CharacterSprite | null>(null);

  useEffect(() => {
    if (visible) {
      loadLibrary();
    }
  }, [visible, storyId]);

  const loadLibrary = async () => {
    const lib = await characterLibrary.getCharacterLibrary(storyId);
    setCharacters(lib);
  };

  const handleAddCharacter = () => {
    Alert.prompt(
      'New Character',
      'Enter character name:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (name?: string) => {
            if (!name?.trim()) return;
            try {
              const newChar = await characterLibrary.addCharacter(storyId, {
                name,
                sprites: [],
              });
              setCharacters([...characters, newChar]);
              setSelectedCharacter(newChar);
            } catch (error) {
              Alert.alert('Error', 'Failed to create character');
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleDeleteCharacter = async (characterId: string) => {
    Alert.alert('Delete Character', 'Are you sure? All sprites will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await characterLibrary.deleteCharacter(storyId, characterId);
            setCharacters(characters.filter((c) => c.id !== characterId));
            if (selectedCharacter?.id === characterId) {
              setSelectedCharacter(null);
            }
          } catch {
            Alert.alert('Error', 'Failed to delete character');
          }
        },
      },
    ]);
  };

  const handleAddSprite = async () => {
    if (!selectedCharacter) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const { uri, name } = result.assets[0];

      Alert.prompt(
        'Sprite Name',
        'Enter name (e.g., Happy, Sad, Casual):',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add',
            onPress: async (spriteName?: string) => {
              if (!spriteName?.trim()) return;

              const newSprite = await characterLibrary.addSpriteToCharacter(
                storyId,
                selectedCharacter.id,
                {
                  name: spriteName,
                  uri,
                  tags: [],
                }
              );

              // Reload library
              await loadLibrary();
              const updated = await characterLibrary.getCharacter(
                storyId,
                selectedCharacter.id
              );
              if (updated) setSelectedCharacter(updated);
            },
          },
        ],
        'plain-text',
        name.replace(/\.[^/.]+$/, '')
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to add sprite');
      console.error(error);
    }
  };

  const handleDeleteSprite = async (spriteId: string) => {
    if (!selectedCharacter) return;

    Alert.alert('Delete Sprite', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await characterLibrary.deleteSprite(storyId, selectedCharacter.id, spriteId);
            await loadLibrary();
            const updated = await characterLibrary.getCharacter(
              storyId,
              selectedCharacter.id
            );
            if (updated) setSelectedCharacter(updated);
          } catch {
            Alert.alert('Error', 'Failed to delete sprite');
          }
        },
      },
    ]);
  };

  const handleEditSprite = (sprite: CharacterSprite) => {
    setEditingSprite({ ...sprite });
  };

  const handleSaveSprite = async () => {
    if (!editingSprite || !selectedCharacter) return;

    try {
      await characterLibrary.updateSprite(
        storyId,
        selectedCharacter.id,
        editingSprite.id,
        {
          name: editingSprite.name,
          tags: editingSprite.tags,
        }
      );
      await loadLibrary();
      const updated = await characterLibrary.getCharacter(storyId, selectedCharacter.id);
      if (updated) setSelectedCharacter(updated);
      setEditingSprite(null);
    } catch {
      Alert.alert('Error', 'Failed to update sprite');
    }
  };

  const filteredCharacters = characters.filter((char) =>
    char.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          {/* Left Panel: Character List */}
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

            <ScrollView style={styles.characterList}>
              {filteredCharacters.map((char) => (
                <Pressable
                  key={char.id}
                  style={[
                    styles.characterItem,
                    {
                      backgroundColor:
                        selectedCharacter?.id === char.id ? colors.primary : colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setSelectedCharacter(char)}
                >
                  <View style={styles.characterInfo}>
                    <Text
                      style={[
                        styles.characterName,
                        {
                          color:
                            selectedCharacter?.id === char.id ? '#fff' : colors.foreground,
                        },
                      ]}
                    >
                      {char.name}
                    </Text>
                    <Text
                      style={[
                        styles.spriteCount,
                        { color: selectedCharacter?.id === char.id ? '#fff' : colors.muted },
                      ]}
                    >
                      {char.sprites.length} sprites
                    </Text>
                  </View>
                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => handleDeleteCharacter(char.id)}
                  >
                    <Text style={{ color: colors.error }}>🗑</Text>
                  </Pressable>
                </Pressable>
              ))}

              {filteredCharacters.length === 0 && (
                <View style={styles.empty}>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    No characters
                  </Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={handleAddCharacter}
            >
              <Text style={styles.addButtonText}>+ Add Character</Text>
            </Pressable>
          </View>

          {/* Right Panel: Sprite List */}
          <View style={styles.rightPanel}>
            {selectedCharacter ? (
              <>
                <View style={styles.spriteHeader}>
                  <Text style={[styles.spriteTitle, { color: colors.foreground }]}>
                    {selectedCharacter.name} - Sprites
                  </Text>
                  <Pressable
                    style={[styles.addSpriteButton, { backgroundColor: colors.primary }]}
                    onPress={handleAddSprite}
                  >
                    <Text style={styles.addSpriteButtonText}>+ Add Sprite</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.spriteList}>
                  {selectedCharacter.sprites.map((sprite) => (
                    <View
                      key={sprite.id}
                      style={[
                        styles.spriteItem,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <Image source={{ uri: sprite.uri }} style={styles.spriteImage} />
                      <View style={styles.spriteInfo}>
                        <Text style={[styles.spriteName, { color: colors.foreground }]}>
                          {sprite.name}
                        </Text>
                        {sprite.tags && sprite.tags.length > 0 && (
                          <View style={styles.tags}>
                            {sprite.tags.map((tag, i) => (
                              <View
                                key={i}
                                style={[styles.tag, { backgroundColor: colors.background }]}
                              >
                                <Text style={[styles.tagText, { color: colors.muted }]}>
                                  {tag}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {selectedCharacter.defaultSpriteId === sprite.id && (
                          <Text style={[styles.defaultBadge, { color: colors.primary }]}>
                            ⭐ Default
                          </Text>
                        )}
                      </View>
                      <View style={styles.spriteActions}>
                        {onSelectSprite && (
                          <Pressable
                            style={[styles.actionButton, { backgroundColor: colors.primary }]}
                            onPress={() => {
                              onSelectSprite(selectedCharacter, sprite);
                              onClose();
                            }}
                          >
                            <Text style={styles.actionButtonText}>Use</Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={[
                            styles.actionButton,
                            {
                              backgroundColor: colors.surface,
                              borderWidth: 1,
                              borderColor: colors.border,
                            },
                          ]}
                          onPress={() => handleEditSprite(sprite)}
                        >
                          <Text style={[styles.actionButtonText, { color: colors.foreground }]}>
                            Edit
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionButton, { backgroundColor: colors.error }]}
                          onPress={() => handleDeleteSprite(sprite.id)}
                        >
                          <Text style={styles.actionButtonText}>Del</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}

                  {selectedCharacter.sprites.length === 0 && (
                    <View style={styles.empty}>
                      <Text style={[styles.emptyText, { color: colors.muted }]}>
                        No sprites for this character
                      </Text>
                      <Text style={[styles.emptySubtext, { color: colors.muted }]}>
                        Tap + Add Sprite to add images
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </>
            ) : (
              <View style={styles.noSelection}>
                <Text style={[styles.noSelectionText, { color: colors.muted }]}>
                  Select a character to view sprites
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Edit Sprite Modal */}
        {editingSprite && (
          <View style={[styles.editModal, { backgroundColor: colors.background }]}>
            <Text style={[styles.editTitle, { color: colors.foreground }]}>Edit Sprite</Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="Name"
              placeholderTextColor={colors.muted}
              value={editingSprite.name}
              onChangeText={(text) => setEditingSprite({ ...editingSprite, name: text })}
            />

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="Tags (comma-separated)"
              placeholderTextColor={colors.muted}
              value={editingSprite.tags?.join(', ') || ''}
              onChangeText={(text) =>
                setEditingSprite({
                  ...editingSprite,
                  tags: text
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            />

            <View style={styles.editActions}>
              <Pressable
                style={[styles.editButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveSprite}
              >
                <Text style={styles.editButtonText}>Save</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.editButton,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setEditingSprite(null)}
              >
                <Text style={[styles.editButtonText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
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
  characterList: {
    flex: 1,
  },
  characterItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  spriteCount: {
    fontSize: 11,
  },
  deleteButton: {
    padding: 4,
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
  rightPanel: {
    flex: 1,
    padding: 12,
  },
  spriteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  spriteTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  addSpriteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addSpriteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  spriteList: {
    flex: 1,
  },
  spriteItem: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  spriteImage: {
    width: 60,
    height: 80,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  spriteInfo: {
    flex: 1,
  },
  spriteName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
  },
  defaultBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  spriteActions: {
    gap: 4,
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  noSelection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noSelectionText: {
    fontSize: 14,
  },
  empty: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 11,
  },
  editModal: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
