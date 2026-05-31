import type {
  BlockData,
  BlockType,
  BackgroundBlockData,
  CharacterBlockData,
  TextBlockData,
  DialogueBlockData,
  ChoiceBlockData,
  EffectBlockData,
  MusicBlockData,
  SoundBlockData,
  InteractiveObjectBlockData,
  CameraBlockData,
  VariableBlockData,
  TransitionBlockData,
} from '@/lib/engine/types';

/**
 * Map each BlockType literal to its corresponding BlockData interface.
 * Used for safe type narrowing inside switch cases.
 */
export type BlockDataByType = {
  background: BackgroundBlockData;
  character: CharacterBlockData;
  text: TextBlockData;
  dialogue: DialogueBlockData;
  choice: ChoiceBlockData;
  effect: EffectBlockData;
  music: MusicBlockData;
  sound: SoundBlockData;
  interactive_object: InteractiveObjectBlockData;
  camera: CameraBlockData;
  variable: VariableBlockData;
  transition: TransitionBlockData;
};

export function isBlockComplete(blockType: BlockType, data: BlockData): boolean {
  switch (blockType) {
    case 'background': {
      const d = data as BlockDataByType['background'];
      return !!d.assetId;
    }
    case 'character': {
      const d = data as BlockDataByType['character'];
      return !!d.characterId;
    }
    case 'text': {
      const d = data as BlockDataByType['text'];
      return !!(d.content && d.content.trim());
    }
    case 'dialogue': {
      const d = data as BlockDataByType['dialogue'];
      return d.entries.length > 0 && d.entries.some((e) => e.text?.trim());
    }
    case 'choice': {
      const d = data as BlockDataByType['choice'];
      return d.options.length > 0 && d.options.some((o) => o.text?.trim());
    }
    case 'music':
    case 'sound': {
      const d = data as BlockDataByType['music'] | BlockDataByType['sound'];
      return d.action === 'stop' || !!d.assetId;
    }
    case 'variable': {
      const d = data as BlockDataByType['variable'];
      return !!d.variableName;
    }
    case 'interactive_object': {
      const d = data as BlockDataByType['interactive_object'];
      return !!d.name;
    }
    case 'effect':
    case 'camera':
    case 'transition': {
      return true; // no required fields
    }
  }
}

export function getBlockEmptyFields(blockType: BlockType, data: BlockData): string[] {
  const empty: string[] = [];
  switch (blockType) {
    case 'background': {
      const d = data as BlockDataByType['background'];
      if (!d.assetId) empty.push('Asset');
      break;
    }
    case 'character': {
      const d = data as BlockDataByType['character'];
      if (!d.characterId) empty.push('Character');
      break;
    }
    case 'text': {
      const d = data as BlockDataByType['text'];
      if (!d.content?.trim()) empty.push('Content');
      break;
    }
    case 'dialogue': {
      const d = data as BlockDataByType['dialogue'];
      if (!d.entries.length) {
        empty.push('Speaker');
      } else {
        const emptyEntryIndex = d.entries.findIndex((e) => !e.text?.trim() && !e.characterId);
        if (emptyEntryIndex !== -1) empty.push(`Speaker ${emptyEntryIndex + 1}`);
      }
      break;
    }
    case 'choice': {
      const d = data as BlockDataByType['choice'];
      if (!d.options.length) {
        empty.push('Choices');
      } else {
        const emptyOptIndex = d.options.findIndex((o) => !o.text?.trim());
        if (emptyOptIndex !== -1) empty.push(`Choice ${emptyOptIndex + 1}`);
      }
      break;
    }
    case 'music':
    case 'sound': {
      const d = data as BlockDataByType['music'] | BlockDataByType['sound'];
      if (!d.assetId && d.action !== 'stop') empty.push('Asset');
      break;
    }
    case 'variable': {
      const d = data as BlockDataByType['variable'];
      if (!d.variableName) empty.push('Variable Name');
      break;
    }
    case 'interactive_object': {
      const d = data as BlockDataByType['interactive_object'];
      if (!d.name) empty.push('Object Name');
      break;
    }
    case 'effect':
    case 'camera':
    case 'transition': {
      break; // no required fields
    }
  }
  return empty;
}