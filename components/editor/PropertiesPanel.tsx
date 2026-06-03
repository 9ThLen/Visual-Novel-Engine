/**
 * components/editor/PropertiesPanel.tsx — Right panel with form fields.
 *
 * Thin orchestrator that dispatches to per-block form subcomponents via
 * `formRegistry` (see `./properties/registry.ts`). All chrome (header/footer),
 * asset input, and picker state are extracted to `./properties/`.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { BLOCK_TYPE_INFO, type TimelineStep, type BlockType, type BlockData } from '@/lib/engine/types';
import { getBlockEmptyFields, type BlockDataByType } from '@/lib/editor/block-validation';
import { useI18n } from '@/lib/i18n';
import { PanelHeader, PanelFooter } from './properties/panel-chrome';
import { AssetField } from './properties/asset-field';
import { useBlockPicker } from './properties/use-block-picker';
import { formRegistry } from './properties/registry';
import type { PropertiesFormProps, TypedUpdater } from './properties/types';

interface Props {
  block: TimelineStep;
  onUpdate: (updates: Partial<TimelineStep>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}

function useTypedBlock<T extends BlockType>(
  blockType: T,
  data: BlockData,
  onUpdate: (updates: Partial<TimelineStep>) => void,
) {
  const typedData = data as BlockDataByType[T];
  const upd: TypedUpdater<T> = <K extends keyof BlockDataByType[T]>(
    field: K,
    value: BlockDataByType[T][K],
  ) => onUpdate({ data: { ...typedData, [field]: value } });
  return { data: typedData, upd };
}

export function PropertiesPanel({ block, onUpdate, onDelete, onDuplicate, onClose }: Props) {
  const colors = useColors();
  const { t } = useI18n();
  const info = BLOCK_TYPE_INFO[block.blockType];
  const { data, upd } = useTypedBlock(block.blockType, block.data, onUpdate);

  const missingFields = useMemo(
    () => new Set(getBlockEmptyFields(block.blockType, data)),
    [block.blockType, data],
  );

  const { openPicker, pickerElement } = useBlockPicker();

  const renderAssetField: PropertiesFormProps<BlockType>['renderAssetField'] = (
    label,
    category,
    value,
    onChange,
  ) => (
    <AssetField
      label={label}
      category={category}
      value={value}
      onChange={onChange}
      onPick={() => openPicker(category, value, onChange)}
      colors={colors}
      t={t}
    />
  );

  const FormComponent = formRegistry[block.blockType];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <PanelHeader info={info} colors={colors} t={t} onClose={onClose} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {FormComponent ? (
          <FormComponent
            data={data}
            upd={upd}
            colors={colors}
            missingFields={missingFields}
            t={t}
            openPicker={openPicker}
            renderAssetField={renderAssetField}
          />
        ) : (
          <Text style={{ color: colors.muted }}>Unknown block type: {block.blockType}</Text>
        )}
      </ScrollView>

      {pickerElement}
      <PanelFooter colors={colors} t={t} onDuplicate={onDuplicate} onDelete={onDelete} />
    </View>
  );
}
