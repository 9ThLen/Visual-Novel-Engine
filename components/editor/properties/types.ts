/**
 * components/editor/properties/types.ts — Shared types for property form subcomponents.
 *
 * Each per-block-type form (Background, Character, etc.) accepts a
 * `PropertiesFormProps<T>` typed to its specific block data. The orchestrating
 * `PropertiesPanel` looks up the right form component from `registry.ts`.
 */
import type { BlockType } from '@/lib/engine/types';
import type { BlockDataByType } from '@/lib/editor/block-validation';
import type { AssetCategory } from '../modals/AssetPicker';
import type { ThemeColorPalette } from '@/constants/theme';
import type { ReactNode } from 'react';

export type TypedUpdater<T extends BlockType> = <K extends keyof BlockDataByType[T]>(
  field: K,
  value: BlockDataByType[T][K],
) => void;

export interface PropertiesFormProps<T extends BlockType> {
  data: BlockDataByType[T];
  upd: TypedUpdater<T>;
  colors: ThemeColorPalette;
  missingFields: Set<string>;
  t: (key: string, params?: Record<string, string | number>) => string;
  openPicker: (
    category: AssetCategory,
    current: string | null,
    onChange: (id: string) => void,
  ) => void;
  renderAssetField: (
    label: string,
    category: AssetCategory,
    value: string | null,
    onChange: (v: string) => void,
  ) => ReactNode;
}
