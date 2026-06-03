/**
 * components/editor/properties/use-block-picker.ts — Asset picker state hook.
 *
 * Encapsulates the picker state machine so `PropertiesPanel.tsx` stays focused
 * on composition. The hook returns `openPicker` and a slot for the AssetPicker
 * modal element.
 */
import { useState, useCallback } from 'react';
import { AssetPicker, type AssetCategory } from '../modals/AssetPicker';

export type PickerOpen = (
  category: AssetCategory,
  _current: string | null,
  onChange: (id: string) => void,
) => void;

export function useBlockPicker() {
  const [picker, setPicker] = useState<{
    visible: boolean;
    category: AssetCategory;
    onSelect: (id: string) => void;
  }>({ visible: false, category: 'backgrounds', onSelect: () => {} });

  const openPicker: PickerOpen = useCallback((category, _current, onChange) => {
    setPicker({
      visible: true,
      category,
      onSelect: (id: string) => {
        onChange(id);
        setPicker((prev) => ({ ...prev, visible: false }));
      },
    });
  }, []);

  const closePicker = useCallback(() => {
    setPicker((prev) => ({ ...prev, visible: false }));
  }, []);

  const pickerElement = picker.visible ? (
    <AssetPicker
      visible
      category={picker.category}
      onSelect={picker.onSelect}
      onClose={closePicker}
    />
  ) : null;

  return { openPicker, pickerElement };
}
