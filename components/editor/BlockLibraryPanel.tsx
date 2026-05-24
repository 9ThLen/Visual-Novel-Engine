/**
 * components/editor/BlockLibraryPanel.tsx — Left panel with draggable block types
 *
 * Shows all 12 block types with color-coded borders, icons, labels.
 * Searchable. On tap, adds block to timeline.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { BLOCK_TYPE_INFO, type BlockType } from '@/lib/engine/types';

interface BlockLibraryPanelProps {
  onBlockTap: (blockType: BlockType) => void;
}

export function BlockLibraryPanel({ onBlockTap }: BlockLibraryPanelProps) {
  const colors = useColors();
  const [query, setQuery] = useState('');

  const filteredBlocks = useMemo(() => {
    const all = Object.values(BLOCK_TYPE_INFO);
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(
      b => b.label.toLowerCase().includes(q) || b.description.toLowerCase().includes(q)
    );
  }, [query]);

  const handleSearch = (text: string) => {
    setQuery(text);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <Text style={{
          fontSize: 13,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: colors['foreground-tertiary'] || colors.muted,
          marginBottom: 8,
        }}>
          🧱 Block Library
        </Text>
        <TextInput
          value={query}
          onChangeText={handleSearch}
          placeholder="Search blocks..."
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            fontSize: 13,
            color: colors.foreground,
          }}
        />
      </View>

      {/* Block list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {filteredBlocks.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>No blocks found</Text>
          </View>
        ) : (
          filteredBlocks.map((blockInfo) => (
            <Pressable
              key={blockInfo.type}
              onPress={() => onBlockTap(blockInfo.type)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginHorizontal: 6,
                marginVertical: 2,
                borderRadius: 8,
                backgroundColor: pressed ? (colors.hover || '#ffffff10') : 'transparent',
                borderLeftWidth: 4,
                borderLeftColor: blockInfo.color,
              })}
            >
              {/* Icon */}
              <View style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: blockInfo.bgColor,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}>
                <Text style={{ fontSize: 18 }}>{blockInfo.icon}</Text>
              </View>

              {/* Label + Description */}
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors.foreground,
                }}>
                  {blockInfo.label}
                </Text>
                <Text style={{
                  fontSize: 11,
                  color: colors.muted,
                  marginTop: 1,
                }}>
                  {blockInfo.description}
                </Text>
              </View>

              {/* Add indicator */}
              <Text style={{
                fontSize: 16,
                color: colors.primary,
                opacity: 0.6,
              }}>
                +
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
