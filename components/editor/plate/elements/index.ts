import type { PlateSceneBlock, PlateTechnicalBlock } from '../types';

export function isTechnicalPlateBlock(block: PlateSceneBlock): block is PlateTechnicalBlock {
  return block.kind === 'technical';
}

export function plateBlockLabel(block: PlateSceneBlock): string {
  if (block.kind === 'technical') return block.label || block.commandId;
  if (block.kind === 'dialogue') return block.speakerName || block.characterId || 'Dialogue';
  if (block.kind === 'choice') return block.question || 'Choice';
  return 'Text';
}
