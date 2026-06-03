/**
 * components/editor/properties/panel-chrome.tsx — Header/footer for PropertiesPanel.
 *
 * Extracted to keep the orchestrator (`PropertiesPanel.tsx`) under 200 LOC.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getBlockIconName } from '@/lib/editor/block-icon';
import { withAlpha } from '@/lib/_core/theme';
import type { BlockTypeInfo } from '@/lib/engine/types';
import type { useColors } from '@/hooks/use-colors';

export function PanelHeader({
  info,
  colors,
  t,
  onClose,
}: {
  info: BlockTypeInfo;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
  onClose: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: info.color,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <IconSymbol
          name={getBlockIconName(info.type)}
          size={18}
          color={info.color}
          style={{ marginRight: 6 }}
        />
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>
          {info.label}
        </Text>
      </View>
      <Pressable
        onPress={onClose}
        style={{ padding: 4 }}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.closePanel')}
        accessibilityHint="Close properties panel"
      >
        <IconSymbol name="close" size={16} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export function PanelFooter({
  colors,
  t,
  onDuplicate,
  onDelete,
}: {
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const baseBtn = { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 } as const;
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Pressable
        onPress={onDuplicate}
        style={[baseBtn, { borderWidth: 1, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={t('common.duplicate')}
        accessibilityHint="Duplicate this block"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconSymbol name="duplicate" size={14} color={colors.foreground} />
          <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: '600' }}>
            {t('common.duplicate')}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onDelete}
        style={[baseBtn, { backgroundColor: withAlpha(colors.error, 0.13) }]}
        accessibilityRole="button"
        accessibilityLabel={t('common.delete')}
        accessibilityHint="Delete this block from timeline"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconSymbol name="delete" size={14} color={colors.error} />
          <Text style={{ fontSize: 12, color: colors.error, fontWeight: '600' }}>
            {t('common.delete')}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
