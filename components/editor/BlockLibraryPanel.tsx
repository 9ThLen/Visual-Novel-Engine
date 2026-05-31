/**
 * components/editor/BlockLibraryPanel.tsx — Left panel with categorized block types
 *
 * Groups the 12 block types by category (Scene / Dialogue / Media / Effects / Logic).
 * Sorted by frequency of use within each category.
 * Searchable. Long press shows tooltip. Tap adds block to timeline.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { BLOCK_TYPE_INFO, BLOCK_CATEGORIES, type BlockCategory, type BlockType, type BlockTypeInfo } from '@/lib/engine/types';
import { useI18n } from '@/lib/i18n';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getBlockCategoryIconName, getBlockIconName } from '@/lib/editor/block-icon';

interface BlockLibraryPanelProps {
  onBlockTap: (blockType: BlockType) => void;
}

const searchInputDataSetProps = {
  dataSet: { searchInput: true },
} as { dataSet: { searchInput: boolean } };

// Priority order within each category (most frequent first)
const CATEGORY_BLOCK_ORDER: Record<BlockCategory, BlockType[]> = {
  scene: ['character', 'interactive_object'],
  dialogue: ['dialogue', 'text', 'choice'],
  media: ['music', 'sound'],
  effects: ['effect', 'transition', 'camera'],
  logic: ['variable'],
};

export function BlockLibraryPanel({ onBlockTap }: BlockLibraryPanelProps) {
  const colors = useColors();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [tooltip, setTooltip] = useState<{ info: BlockTypeInfo; x: number; y: number } | null>(null);

  const filteredByQuery = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return Object.values(BLOCK_TYPE_INFO).filter(
      b =>
        t(`editor.block.${b.type}`, undefined, b.label).toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q)
    );
  }, [query, t]);

  const groupedBlocks = useMemo(() => {
    if (filteredByQuery) return null;

    return BLOCK_CATEGORIES.map(cat => {
      const blocks = CATEGORY_BLOCK_ORDER[cat.key]
        .map(type => BLOCK_TYPE_INFO[type])
        .filter(Boolean);
      return { ...cat, blocks };
    }).filter(cat => cat.blocks.length > 0);
  }, [filteredByQuery]);

  const showTooltip = (info: BlockTypeInfo) => {
    setTooltip({ info, x: 0, y: 0 });
  };

  const renderBlockItem = (blockInfo: BlockTypeInfo) => (
    <Pressable
      key={blockInfo.type}
      onPress={() => onBlockTap(blockInfo.type)}
      onLongPress={() => showTooltip(blockInfo)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 6,
        marginVertical: 2,
        borderRadius: 8,
        backgroundColor: pressed ? (colors.hover) : 'transparent',
        borderLeftWidth: 4,
        borderLeftColor: blockInfo.color,
      })}
      accessibilityRole="button"
      accessibilityLabel={t(`editor.block.${blockInfo.type}`, undefined, blockInfo.label)}
    >
      <View style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: blockInfo.bgColor,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
      }}>
        <IconSymbol name={getBlockIconName(blockInfo.type)} size={20} color={blockInfo.color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: 14,
          fontWeight: '600',
          color: colors.foreground,
        }}>
          {t(`editor.block.${blockInfo.type}`, undefined, blockInfo.label)}
        </Text>
        <Text style={{
          fontSize: 11,
          color: colors.muted,
          marginTop: 1,
        }}>
          {blockInfo.description}
        </Text>
      </View>

      <Text style={{
        fontSize: 16,
        color: colors.primary,
        opacity: 0.6,
      }}>
        +
      </Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
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
          {t('editor.blockLibrary')}
        </Text>
        <TextInput
          {...searchInputDataSetProps}
          value={query}
          onChangeText={setQuery}
          placeholder={t('editor.searchBlocks')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('editor.searchBlocks')}
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {filteredByQuery ? (
          filteredByQuery.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{t('editor.noBlocksFound')}</Text>
            </View>
          ) : (
            filteredByQuery.map(renderBlockItem)
          )
        ) : groupedBlocks ? (
          groupedBlocks.map(category => (
            <View key={category.key}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 6,
                marginTop: 4,
              }}>
                <IconSymbol name={getBlockCategoryIconName(category.key)} size={14} color={colors.muted} style={{ marginRight: 4 }} />
                <Text style={{
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: colors.muted,
                }}>
                  {category.label}
                </Text>
              </View>
              {category.blocks.map(renderBlockItem)}
            </View>
          ))
        ) : null}
      </ScrollView>

      {tooltip && (
        <Modal transparent animationType="fade" onRequestClose={() => setTooltip(null)}>
          <Pressable
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}
            onPress={() => setTooltip(null)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <View style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 20,
              marginHorizontal: 40,
              maxWidth: 300,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}>
              <View style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: tooltip.info.bgColor,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}>
                <IconSymbol name={getBlockIconName(tooltip.info.type)} size={24} color={tooltip.info.color} />
              </View>
              <Text style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.foreground,
                marginBottom: 4,
              }}>
                {tooltip.info.label}
              </Text>
              <Text style={{
                fontSize: 13,
                color: colors.muted,
                textAlign: 'center',
                lineHeight: 18,
              }}>
                {tooltip.info.description}
              </Text>
              <Pressable
                onPress={() => { onBlockTap(tooltip.info.type); setTooltip(null); }}
                style={{
                  marginTop: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: tooltip.info.color,
                }}
                accessibilityRole="button"
                accessibilityLabel={t('editor.addBlock')}
              >
                <Text style={{ fontSize: 13, color: colors['text-inverse'], fontWeight: '600' }}>{t('editor.addBlock')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
