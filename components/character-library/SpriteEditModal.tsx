import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { CharacterSprite } from '@/lib/character-types';

interface SpriteEditModalProps {
  editingSprite: CharacterSprite;
  setEditingSprite: (sprite: CharacterSprite | null) => void;
  onSave: () => void;
  colors: any;
}

export const SpriteEditModal = ({ editingSprite, setEditingSprite, onSave, colors }: SpriteEditModalProps) => {
  return (
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
          onPress={onSave}
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
  );
};

const styles = StyleSheet.create({
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
    zIndex: 2000,
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
