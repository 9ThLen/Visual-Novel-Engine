/**
 * components/editor/BlockLibraryPanel.tsx — Left panel with categorized block types
 *
 * Groups the 12 block types by category (Scene / Dialogue / Media / Effects / Logic).
 * Sorted by frequency of use within each category.
 * Searchable. Long press shows tooltip. Tap adds block to timeline.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { BLOCK_TYPE_INFO, BLOCK_CATEGORIES, type BlockCategory, type BlockType, type BlockTypeInfo } from '@/lib/engine/types';
import { useI18n } from '@/lib/i18n';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
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
  const blockDescription = useCallback(
    (blockInfo: BlockTypeInfo) => t(`editor.blockDescription.${blockInfo.type}`, undefined, blockInfo.description),
    [t],
  );

  const filteredByQuery = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return Object.values(BLOCK_TYPE_INFO).filter(
      b =>
        t(`editor.block.${b.type}`, undefined, b.label).toLowerCase().includes(q) ||
        blockDescription(b).toLowerCase().includes(q)
    );
  }, [blockDescription, query, t]);

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
      disabled={blockInfo.disabled}
      onPress={() => {
        if (blockInfo.disabled) return;
        onBlockTap(blockInfo.type);
      }}
      onLongPress={() => showTooltip(blockInfo)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        marginHorizontal: spacing.xs,
        marginVertical: 2,
        borderRadius: radius.md,
        backgroundColor: pressed && !blockInfo.disabled ? (colors.hover) : 'transparent',
        borderLeftWidth: 4,
        borderLeftColor: blockInfo.color,
        opacity: blockInfo.disabled ? 0.58 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={t(`editor.block.${blockInfo.type}`, undefined, blockInfo.label)}
      accessibilityHint={blockInfo.disabled ? t('editor.blockUnavailable') : t('editor.addBlockHint')}
      accessibilityState={{ disabled: blockInfo.disabled }}
    >
      <View style={{
        width: 36,
        height: 36,
        borderRadius: radius.md,
        backgroundColor: blockInfo.bgColor,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.sm,
      }}>
        <IconSymbol name={getBlockIconName(blockInfo.type)} size={20} color={blockInfo.color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{
          ...typeScale.label,
          color: colors.foreground,
        }}>
          {t(`editor.block.${blockInfo.type}`, undefined, blockInfo.label)}
        </Text>
        <Text style={{
          ...typeScale.micro,
          color: colors.muted,
          marginTop: 1,
        }}>
          {blockDescription(blockInfo)}
        </Text>
      </View>

      {blockInfo.comingSoon && (
        <Text style={{
          ...typeScale.micro,
          fontWeight: '700',
          color: colors.warning,
          marginRight: spacing.xs,
          paddingHorizontal: spacing.xs,
          paddingVertical: 1,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.warning,
          overflow: 'hidden',
        }}>
          {t('common.comingSoon')}
        </Text>
      )}

      <Text style={{
        ...typeScale.label,
        color: colors.primary,
        opacity: blockInfo.disabled ? 0.18 : 0.6,
      }}>
        +
      </Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <Text style={{
          ...typeScale.caption,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: colors['foreground-tertiary'] || colors.muted,
          marginBottom: spacing.sm,
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
            borderRadius: radius.md,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
            ...typeScale.caption,
            color: colors.foreground,
          }}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: spacing.sm }}
        showsVerticalScrollIndicator={false}
      >
        {filteredByQuery ? (
          filteredByQuery.length === 0 ? (
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <Text style={{ color: colors.muted, ...typeScale.caption }}>{t('editor.noBlocksFound')}</Text>
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
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                marginTop: spacing.xs,
              }}>
                <IconSymbol name={getBlockCategoryIconName(category.key)} size={14} color={colors.muted} style={{ marginRight: spacing.xs }} />
                <Text style={{
                  ...typeScale.micro,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: colors.muted,
                }}>
                  {t(`editor.category.${category.key}`, undefined, category.label)}
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
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backdrop }}
            onPress={() => setTooltip(null)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <View style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: spacing.xl,
              marginHorizontal: 40,
              maxWidth: 300,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}>
              <View style={{
                width: 48,
                height: 48,
                borderRadius: radius.lg,
                backgroundColor: tooltip.info.bgColor,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.md,
              }}>
                <IconSymbol name={getBlockIconName(tooltip.info.type)} size={24} color={tooltip.info.color} />
              </View>
              <Text style={{
                ...typeScale.label,
                fontWeight: '700',
                color: colors.foreground,
                marginBottom: 4,
              }}>
                {t(`editor.block.${tooltip.info.type}`, undefined, tooltip.info.label)}
              </Text>
              <Text style={{
                ...typeScale.caption,
                color: colors.muted,
                textAlign: 'center',
                lineHeight: 18,
              }}>
                {blockDescription(tooltip.info)}
              </Text>
              <Pressable
                disabled={tooltip.info.disabled}
                onPress={() => {
                  if (tooltip.info.disabled) return;
                  onBlockTap(tooltip.info.type);
                  setTooltip(null);
                }}
                style={{
                  marginTop: spacing.lg,
                  paddingHorizontal: spacing.xl,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: tooltip.info.color,
                  opacity: tooltip.info.disabled ? 0.5 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel={t('editor.addBlock')}
                accessibilityHint={t('editor.addBlockHint')}
                accessibilityState={{ disabled: tooltip.info.disabled }}
              >
                <Text style={{ ...typeScale.caption, color: colors['text-inverse'] }}>
                  {tooltip.info.comingSoon ? t('common.comingSoon') : t('editor.addBlock')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
