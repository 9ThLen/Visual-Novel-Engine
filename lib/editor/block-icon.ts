import type { IconSymbolName } from '@/components/ui/icon-symbol';
import type { BlockCategory, BlockType } from '@/lib/engine/types';

const BLOCK_ICON_BY_TYPE: Record<BlockType, IconSymbolName> = {
  background: 'image',
  character: 'character',
  text: 'document',
  dialogue: 'voice',
  choice: 'timeline',
  effect: 'lightning',
  music: 'music',
  sound: 'sound',
  interactive_object: 'location',
  camera: 'preview',
  variable: 'settings',
  transition: 'timeline',
};

const BLOCK_ICON_BY_CATEGORY: Record<BlockCategory, IconSymbolName> = {
  scene: 'preview',
  dialogue: 'voice',
  media: 'music',
  effects: 'lightning',
  logic: 'settings',
};

export function getBlockIconName(type: BlockType): IconSymbolName {
  return BLOCK_ICON_BY_TYPE[type];
}

export function getBlockCategoryIconName(category: BlockCategory): IconSymbolName {
  return BLOCK_ICON_BY_CATEGORY[category];
}
