import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { BlockType } from '../../lib/block-types';
import {
  BLOCK_REGISTRY,
  BLOCK_CATEGORIES,
  BlockCategory,
  getBlocksByCategory,
  BlockRegistryEntry,
} from '../../lib/block-registry';

interface BlockPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: BlockType) => void;
  colors: {
    foreground: string;
    background: string;
    surface: string;
    border: string;
    muted: string;
    primary: string;
  };
}

export const BlockPickerModal: React.FC<BlockPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  colors,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<BlockCategory | 'all'>('all');

  const filteredBlocks = useMemo(() => {
    const blocks = activeCategory === 'all'
      ? Object.values(BLOCK_REGISTRY)
      : getBlocksByCategory(activeCategory);

    if (!searchQuery.trim()) return blocks;

    const q = searchQuery.toLowerCase();
    return blocks.filter(
      (b) =>
        b.labelUa.toLowerCase().includes(q) ||
        b.label.toLowerCase().includes(q) ||
        b.descriptionUa.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.icon.includes(q)
    );
  }, [searchQuery, activeCategory]);

  const groupedBlocks = useMemo(() => {
    if (activeCategory === 'all') {
      return BLOCK_CATEGORIES.map((cat) => ({
        category: cat,
        blocks: filteredBlocks.filter((b) => b.category === cat.key),
      })).filter((g) => g.blocks.length > 0);
    }
    const cat = BLOCK_CATEGORIES.find((c) => c.key === activeCategory);
    return cat ? [{ category: cat, blocks: filteredBlocks }] : [];
  }, [filteredBlocks, activeCategory]);

  const handleSelect = (type: BlockType) => {
    onSelect(type);
    setSearchQuery('');
    setActiveCategory('all');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
    >
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
        }}
      >
        {/* Header */}
        <View
          style={{
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: '700',
                color: colors.foreground,
              }}
            >
              Add Block
            </Text>
            <Pressable
              onPress={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.border,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 18, color: colors.muted }}>x</Text>
            </Pressable>
          </View>

          {/* Search */}
          <TextInput
            style={{
              backgroundColor: colors.background,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 14,
              paddingVertical: 10,
              color: colors.foreground,
              fontSize: 15,
            }}
            placeholder="Search blocks..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>

        {/* Category Tabs */}
        <View
          style={{
            backgroundColor: colors.surface,
            padding: 12,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <CategoryTab
            label="All"
            icon="📋"
            isActive={activeCategory === 'all'}
            onPress={() => setActiveCategory('all')}
            colors={colors}
          />
          {BLOCK_CATEGORIES.map((cat) => (
            <CategoryTab
              key={cat.key}
              label={cat.labelUa}
              icon={cat.icon}
              isActive={activeCategory === cat.key}
              onPress={() => setActiveCategory(cat.key)}
              colors={colors}
            />
          ))}
        </View>

        {/* Block List */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        >
          {filteredBlocks.length === 0 && (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>🔍</Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors.foreground,
                  marginBottom: 4,
                }}
              >
                No blocks found
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                Try a different search term
              </Text>
            </View>
          )}

          {groupedBlocks.map((group) => (
            <View key={group.category.key} style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                {group.category.icon} {group.category.labelUa}
              </Text>

              {group.blocks.map((entry) => (
                <BlockPickerItem
                  key={entry.type}
                  entry={entry}
                  colors={colors}
                  onPress={() => handleSelect(entry.type)}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const CategoryTab: React.FC<{
  label: string;
  icon: string;
  isActive: boolean;
  onPress: () => void;
  colors: BlockPickerModalProps['colors'];
}> = ({ label, icon, isActive, onPress, colors }) => (
  <Pressable
    onPress={onPress}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: isActive ? colors.primary : colors.background,
      borderWidth: 1,
      borderColor: isActive ? colors.primary : colors.border,
      maxWidth: 160,
    }}
  >
    <Text style={{ fontSize: 14, marginRight: 4 }}>{icon}</Text>
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      style={{
        fontSize: 12,
        fontWeight: '600',
        color: isActive ? '#fff' : colors.foreground,
      }}
    >
      {label}
    </Text>
  </Pressable>
);

const BlockPickerItem: React.FC<{
  entry: BlockRegistryEntry;
  colors: BlockPickerModalProps['colors'];
  onPress: () => void;
}> = ({ entry, colors, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      marginBottom: 8,
      borderRadius: 12,
      backgroundColor: pressed ? entry.colorLight : colors.surface,
      borderWidth: 1,
      borderColor: pressed ? entry.borderColor : colors.border,
      borderLeftWidth: 4,
      borderLeftColor: entry.color,
    })}
  >
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: entry.color,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
      }}
    >
      <Text style={{ fontSize: 22 }}>{entry.icon}</Text>
    </View>

    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 15,
          fontWeight: '700',
          color: entry.borderColor,
          marginBottom: 2,
        }}
      >
        {entry.labelUa}
      </Text>
      <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={2}>
        {entry.descriptionUa}
      </Text>
    </View>

    <Text style={{ fontSize: 16, color: colors.muted }}>→</Text>
  </Pressable>
);
