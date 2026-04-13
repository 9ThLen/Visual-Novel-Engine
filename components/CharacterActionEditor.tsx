/**
 * Character Action Editor Component
 * UI for configuring character actions in scenes
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import type {
  CharacterAction,
  CharacterActionType,
  CharacterPosition,
  CharacterTransition,
  Character,
  CharacterSprite,
} from '@/lib/character-types';
import { CharacterLibraryManager } from './CharacterLibraryManager';

interface Props {
  storyId: string;
  actions: CharacterAction[];
  onChange: (actions: CharacterAction[]) => void;
}

const ACTION_TYPES: { value: CharacterActionType; label: string; icon: string }[] = [
  { value: 'show', label: 'Show', icon: '👁' },
  { value: 'hide', label: 'Hide', icon: '🚫' },
  { value: 'move', label: 'Move', icon: '↔️' },
  { value: 'change_sprite', label: 'Change Sprite', icon: '🔄' },
  { value: 'animate', label: 'Animate', icon: '✨' },
];

const POSITIONS: { value: CharacterPosition; label: string }[] = [
  { value: 'far-left', label: 'Far Left' },
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'far-right', label: 'Far Right' },
];

const TRANSITIONS: { value: CharacterTransition; label: string; icon: string }[] = [
  { value: 'instant', label: 'Instant', icon: '⚡' },
  { value: 'fade', label: 'Fade', icon: '🌫' },
  { value: 'slide', label: 'Slide', icon: '➡️' },
  { value: 'zoom', label: 'Zoom', icon: '🔍' },
  { value: 'shake', label: 'Shake', icon: '📳' },
];

export function CharacterActionEditor({ storyId, actions, onChange }: Props) {
  const colors = useColors();
  const [showLibrary, setShowLibrary] = useState(false);
  const [editingAction, setEditingAction] = useState<CharacterAction | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedSprite, setSelectedSprite] = useState<CharacterSprite | null>(null);

  const handleAddAction = () => {
    setEditingAction({
      id: `action_${Date.now()}`,
      type: 'show',
      characterId: '',
      position: 'center',
      animation: {
        transition: 'fade',
        duration: 300,
      },
      scale: 1,
      opacity: 1,
      zIndex: 0,
    });
    setShowLibrary(true);
  };

  const handleSelectSprite = (character: Character, sprite: CharacterSprite) => {
    setSelectedCharacter(character);
    setSelectedSprite(sprite);
    if (editingAction) {
      setEditingAction({
        ...editingAction,
        characterId: character.id,
        spriteId: sprite.id,
      });
    }
  };

  const handleSaveAction = () => {
    if (!editingAction || !editingAction.characterId) {
      Alert.alert('Error', 'Please select a character');
      return;
    }

    if (
      (editingAction.type === 'show' || editingAction.type === 'change_sprite') &&
      !editingAction.spriteId
    ) {
      Alert.alert('Error', 'Please select a sprite');
      return;
    }

    const existing = actions.find((a) => a.id === editingAction.id);
    if (existing) {
      onChange(actions.map((a) => (a.id === editingAction.id ? editingAction : a)));
    } else {
      onChange([...actions, editingAction]);
    }

    setEditingAction(null);
    setSelectedCharacter(null);
    setSelectedSprite(null);
  };

  const handleDeleteAction = (actionId: string) => {
    Alert.alert('Delete Action', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onChange(actions.filter((a) => a.id !== actionId)),
      },
    ]);
  };

  const handleEditAction = (action: CharacterAction) => {
    setEditingAction({ ...action });
  };

  return (
    <View style={styles.container}>
      {/* Action List */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Character Actions ({actions.length})
        </Text>
        <Pressable
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={handleAddAction}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {actions.map((action) => (
          <View
            key={action.id}
            style={[
              styles.actionCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.actionHeader}>
              <View style={styles.actionInfo}>
                <Text style={[styles.actionType, { color: colors.primary }]}>
                  {ACTION_TYPES.find((t) => t.value === action.type)?.icon}{' '}
                  {ACTION_TYPES.find((t) => t.value === action.type)?.label}
                </Text>
                <Text style={[styles.characterId, { color: colors.muted }]} numberOfLines={1}>
                  Character: {action.characterId}
                </Text>
              </View>
              <View style={styles.actionActions}>
                <Pressable style={styles.iconButton} onPress={() => handleEditAction(action)}>
                  <Text style={{ color: colors.primary }}>✏️</Text>
                </Pressable>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => handleDeleteAction(action.id)}
                >
                  <Text style={{ color: colors.error }}>🗑</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.actionMeta}>
              {action.position && (
                <Text style={[styles.metaItem, { color: colors.muted }]}>
                  📍 {POSITIONS.find((p) => p.value === action.position)?.label}
                </Text>
              )}
              {action.animation && (
                <Text style={[styles.metaItem, { color: colors.muted }]}>
                  {TRANSITIONS.find((t) => t.value === action.animation?.transition)?.icon}{' '}
                  {action.animation.duration}ms
                </Text>
              )}
              {action.scale !== undefined && action.scale !== 1 && (
                <Text style={[styles.metaItem, { color: colors.muted }]}>
                  Scale: {action.scale}x
                </Text>
              )}
            </View>
          </View>
        ))}

        {actions.length === 0 && (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No character actions
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.muted }]}>
              Tap + Add to create actions
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      {editingAction && (
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <ScrollView
            style={[
              styles.modalContent,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingAction.characterId ? 'Edit' : 'Add'} Character Action
            </Text>

            {/* Selected Character/Sprite */}
            {selectedCharacter && selectedSprite && (
              <View
                style={[
                  styles.selectedInfo,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.selectedText, { color: colors.foreground }]}>
                  👤 {selectedCharacter.name} - {selectedSprite.name}
                </Text>
                <Pressable onPress={() => setShowLibrary(true)}>
                  <Text style={[styles.changeButton, { color: colors.primary }]}>Change</Text>
                </Pressable>
              </View>
            )}

            {!selectedCharacter && (
              <Pressable
                style={[styles.selectButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowLibrary(true)}
              >
                <Text style={styles.selectButtonText}>Select Character from Library</Text>
              </Pressable>
            )}

            {/* Action Type */}
            <Text style={[styles.label, { color: colors.foreground }]}>Action Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.typeButtons}>
                {ACTION_TYPES.map((type) => (
                  <Pressable
                    key={type.value}
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor:
                          editingAction.type === type.value ? colors.primary : colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => setEditingAction({ ...editingAction, type: type.value })}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        {
                          color:
                            editingAction.type === type.value ? '#fff' : colors.foreground,
                        },
                      ]}
                    >
                      {type.icon} {type.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Position (for show/move) */}
            {(editingAction.type === 'show' || editingAction.type === 'move') && (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>Position</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.positionButtons}>
                    {POSITIONS.map((pos) => (
                      <Pressable
                        key={pos.value}
                        style={[
                          styles.positionButton,
                          {
                            backgroundColor:
                              editingAction.position === pos.value
                                ? colors.primary
                                : colors.surface,
                            borderColor: colors.border,
                          },
                        ]}
                        onPress={() =>
                          setEditingAction({ ...editingAction, position: pos.value })
                        }
                      >
                        <Text
                          style={[
                            styles.positionButtonText,
                            {
                              color:
                                editingAction.position === pos.value
                                  ? '#fff'
                                  : colors.foreground,
                            },
                          ]}
                        >
                          {pos.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Transition */}
            <Text style={[styles.label, { color: colors.foreground }]}>Transition</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.transitionButtons}>
                {TRANSITIONS.map((trans) => (
                  <Pressable
                    key={trans.value}
                    style={[
                      styles.transitionButton,
                      {
                        backgroundColor:
                          editingAction.animation?.transition === trans.value
                            ? colors.primary
                            : colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() =>
                      setEditingAction({
                        ...editingAction,
                        animation: {
                          ...editingAction.animation,
                          transition: trans.value,
                          duration: editingAction.animation?.duration || 300,
                        },
                      })
                    }
                  >
                    <Text
                      style={[
                        styles.transitionButtonText,
                        {
                          color:
                            editingAction.animation?.transition === trans.value
                              ? '#fff'
                              : colors.foreground,
                        },
                      ]}
                    >
                      {trans.icon} {trans.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Duration */}
            <Text style={[styles.label, { color: colors.foreground }]}>
              Duration: {editingAction.animation?.duration || 300}ms
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="300"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={editingAction.animation?.duration?.toString() || '300'}
              onChangeText={(text) =>
                setEditingAction({
                  ...editingAction,
                  animation: {
                    ...editingAction.animation,
                    transition: editingAction.animation?.transition || 'fade',
                    duration: parseInt(text) || 300,
                  },
                })
              }
            />

            {/* Delay */}
            <Text style={[styles.label, { color: colors.foreground }]}>Delay (ms, optional)</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={editingAction.animation?.delay?.toString() || ''}
              onChangeText={(text) =>
                setEditingAction({
                  ...editingAction,
                  animation: {
                    ...editingAction.animation,
                    transition: editingAction.animation?.transition || 'fade',
                    duration: editingAction.animation?.duration || 300,
                    delay: parseInt(text) || undefined,
                  },
                })
              }
            />

            {/* Scale */}
            <Text style={[styles.label, { color: colors.foreground }]}>
              Scale: {editingAction.scale || 1}x
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="1.0"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={editingAction.scale?.toString() || '1'}
              onChangeText={(text) =>
                setEditingAction({
                  ...editingAction,
                  scale: parseFloat(text) || 1,
                })
              }
            />

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveAction}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  setEditingAction(null);
                  setSelectedCharacter(null);
                  setSelectedSprite(null);
                }}
              >
                <Text style={[styles.modalButtonText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      )}

      {/* Character Library */}
      <CharacterLibraryManager
        storyId={storyId}
        visible={showLibrary}
        onClose={() => setShowLibrary(false)}
        onSelectSprite={handleSelectSprite}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  actionCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  actionInfo: {
    flex: 1,
  },
  actionType: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  characterId: {
    fontSize: 11,
  },
  actionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  actionMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    fontSize: 10,
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
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  selectedInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  selectedText: {
    fontSize: 13,
    flex: 1,
  },
  changeButton: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  typeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  positionButtons: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  positionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  positionButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  transitionButtons: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  transitionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  transitionButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    borderRadius: 6,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
