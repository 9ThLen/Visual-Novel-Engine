/**
 * components/editor/properties/asset-field.tsx — Reusable asset input row.
 *
 * Extracted from `PropertiesPanel.tsx` to slim the orchestrator.
 * Renders a TextInput + search button that opens the asset picker.
 */
import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Field as FieldHelper, S as inputStyle } from './shared';
import type { useColors } from '@/hooks/use-colors';
import type { AssetCategory } from '../modals/AssetPicker';

export function AssetField({
  label,
  category,
  value,
  onChange,
  onPick,
  colors,
  t,
}: {
  label: string;
  category: AssetCategory;
  value: string | null;
  onChange: (id: string) => void;
  onPick: () => void;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
}) {
  return (
    <FieldHelper t={t} label={label} colors={colors}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TextInput
          value={value || ''}
          onChangeText={onChange}
          placeholder={`Select ${category}...`}
          placeholderTextColor={colors.muted}
          accessibilityLabel={label}
          accessibilityHint="Enter asset ID or tap search to browse"
          style={[inputStyle(colors), { flex: 1 }]}
        />
        <Pressable
          onPress={onPick}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: colors.primary,
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.search')}
        >
          <Text style={{ fontSize: 12, color: colors['text-inverse'], fontWeight: '600' }}>
            {t('common.search')}
          </Text>
        </Pressable>
      </View>
    </FieldHelper>
  );
}
