import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { Character, CharacterSprite } from '@/lib/character-types';
import { SpriteItem } from './SpriteItem';

interface SpriteGalleryProps {
  selectedCharacter: Character;
  colors: any;
  onAddSprite: () => void;
  onEditSprite: (sprite: CharacterSprite) => void;
  onDeleteSprite: (spriteId: string) => void;
  onSelectSprite?: (character: Character, sprite: CharacterSprite) => void;
  onClose: () => void;
}

export const SpriteGallery = ({
  selectedCharacter,
  colors,
  onAddSprite,
  onEditSprite,
  onDeleteSprite,
  onSelectSprite,
  onClose,
}: SpriteGalleryProps) => {
  return (
    <View style={styles.rightPanel}>
      <View style={styles.spriteHeader}>
        <Text style={[styles.spriteTitle, { color: colors.foreground }]}>
          {selectedCharacter.name} - Sprites
        </Text>
        <Pressable
          style={[styles.addSpriteButton, { backgroundColor: colors.primary }]}
          onPress={onAddSprite}
        >
          <Text style={styles.addSpriteButtonText}>+ Add Sprite</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.spriteList}>
        {selectedCharacter.sprites.map((sprite) => (
          <SpriteItem
            key={sprite.id}
            sprite={sprite}
            isDefault={selectedCharacter.defaultSpriteId === sprite.id}
            colors={colors}
            onSelect={onSelectSprite ? () => {
              onSelectSprite(selectedCharacter, sprite);
              onClose();
            } : undefined}
            onEdit={() => onEditSprite(sprite)}
            onDelete={() => onDeleteSprite(sprite.id)}
          />
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
    </View>
  );
};

const styles = StyleSheet.create({
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
});
