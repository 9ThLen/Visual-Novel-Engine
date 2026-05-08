import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Animated,
} from 'react-native';
import {
  BLOCK_REGISTRY,
  BLOCK_CATEGORIES,
  BlockCategory,
  getBlocksByCategory,
  BlockRegistryEntry,
} from '../../lib/block-registry';
import { BlockType } from '../../lib/block-types';

interface BlockPaletteProps {
  onAddBlock: (type: BlockType) => void;
  colors: {
    foreground: string;
    background: string;
    surface: string;
    border: string;
    muted: string;
    primary: string;
  };
}

export const BlockPalette: React.FC<BlockPaletteProps> = ({ onAddBlock, colors }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<BlockCategory | 'all'>('all');

  const filteredBlocks = Object.values(BLOCK_REGISTRY).filter((entry) => {
    const matchesSearch =
      searchQuery === '' ||
      entry.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.labelUa.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      activeCategory === 'all' || entry.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedBlocks =
    activeCategory === 'all'
      ? BLOCK_CATEGORIES.map((cat) => ({
          category: cat,
          blocks: filteredBlocks.filter((b) => b.category === cat.key),
        })).filter((g) => g.blocks.length > 0)
      : [
          {
            category: BLOCK_CATEGORIES.find((c) => c.key === activeCategory)!,
            blocks: filteredBlocks,
          },
        ];

  return (
    <View
      style={{
        width: 260,
        backgroundColor: colors.surface,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        flexDirection: 'column',
      }}
    >
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground, marginBottom: 8 }}>
          Blocks
        </Text>
        <TextInput
          style={{
            backgroundColor: colors.background,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: colors.foreground,
            fontSize: 13,
          }}
          placeholder="Search blocks..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          padding: 8,
          gap: 4,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            backgroundColor: activeCategory === 'all' ? colors.primary : 'transparent',
          }}
          onPress={() => setActiveCategory('all')}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: activeCategory === 'all' ? '#fff' : colors.muted,
            }}
          >
            All
          </Text>
        </Pressable>
        {BLOCK_CATEGORIES.map((cat) => (
          <Pressable
            key={cat.key}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: activeCategory === cat.key ? colors.primary : 'transparent',
            }}
            onPress={() => setActiveCategory(cat.key)}
          >
            <Text style={{ fontSize: 14 }}>{cat.icon}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {groupedBlocks.map((group) => (
          <View key={group.category.key} style={{ padding: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: colors.muted,
                textTransform: 'uppercase',
                marginBottom: 6,
                paddingHorizontal: 4,
              }}
            >
              {group.category.icon} {group.category.labelUa}
            </Text>
            {group.blocks.map((entry) => (
              <BlockPaletteItem
                key={entry.type}
                entry={entry}
                colors={colors}
                onPress={() => onAddBlock(entry.type)}
              />
            ))}
          </View>
        ))}
        {filteredBlocks.length === 0 && (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>No blocks found</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const BlockPaletteItem: React.FC<{
  entry: BlockRegistryEntry;
  colors: BlockPaletteProps['colors'];
  onPress: () => void;
}> = ({ entry, colors, onPress }) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        marginBottom: 4,
        borderRadius: 8,
        backgroundColor: pressed ? entry.colorLight : 'transparent',
        borderLeftWidth: 3,
        borderLeftColor: entry.color,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 18, marginRight: 10 }}>{entry.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>
          {entry.labelUa}
        </Text>
        <Text
          style={{
            fontSize: 10,
            color: colors.muted,
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          {entry.descriptionUa}
        </Text>
      </View>
    </Pressable>
  );
};
