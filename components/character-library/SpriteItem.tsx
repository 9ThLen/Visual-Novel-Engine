import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import type { CharacterSprite } from '@/lib/character-types';

interface SpriteItemProps {
  sprite: CharacterSprite;
  isDefault: boolean;
  colors: any;
  onSelect?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const SpriteItem = React.memo(({ sprite, isDefault, colors, onSelect, onEdit, onDelete }: SpriteItemProps) => (
  <View style={[styles.spriteItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Image source={{ uri: sprite.uri }} style={styles.spriteImage} />
    <View style={styles.spriteInfo}>
      <Text style={[styles.spriteName, { color: colors.foreground }]}>{sprite.name}</Text>
      {sprite.tags && sprite.tags.length > 0 && (
        <View style={styles.tags}>
          {sprite.tags.map((tag, i) => (
            <View key={i} style={[styles.tag, { backgroundColor: colors.background }]}>
              <Text style={[styles.tagText, { color: colors.muted }]}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
      {isDefault && <Text style={[styles.defaultBadge, { color: colors.primary }]}>⭐ Default</Text>}
    </View>
    <View style={styles.spriteActions}>
      {onSelect && (
        <Pressable style={[styles.actionButton, { backgroundColor: colors.primary }]} onPress={onSelect}>
          <Text style={styles.actionButtonText}>Use</Text>
        </Pressable>
      )}
      <Pressable
        style={[styles.actionButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
        onPress={onEdit}
      >
        <Text style={[styles.actionButtonText, { color: colors.foreground }]}>Edit</Text>
      </Pressable>
      <Pressable style={[styles.actionButton, { backgroundColor: colors.error }]} onPress={onDelete}>
        <Text style={styles.actionButtonText}>Del</Text>
      </Pressable>
    </View>
  </View>
));

const styles = StyleSheet.create({
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
});
