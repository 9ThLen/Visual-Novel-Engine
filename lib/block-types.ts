export type BlockCategory = 'text' | 'character' | 'media' | 'logic' | 'effect';

export type BlockType =
  | 'dialogue'
  | 'narration'
  | 'show_character'
  | 'hide_character'
  | 'character_animation'
  | 'set_background'
  | 'play_music'
  | 'play_sfx'
  | 'play_voice'
  | 'choice'
  | 'condition'
  | 'set_variable'
  | 'transition'
  | 'wait'
  | 'group';

export interface Block {
  id: string;
  type: BlockType;
  data: Record<string, any>;
  children: Block[];
  collapsed?: boolean;
  x?: number;
  y?: number;
  sceneId?: string; // Which scene this block belongs to
}

export const BLOCK_CARD_HEIGHT = 48;
export const BLOCK_PADDING_Y = 8;
export const GRID_SIZE = 20;
export const SNAP_TO_GRID = true;

export const ROOT_BLOCK: Block = {
  id: 'root',
  type: 'group',
  data: { title: 'Scene' },
  children: [],
  collapsed: false,
};

export function createDefaultBlock(type: BlockType): Block {
  const defaults: Record<BlockType, Record<string, any>> = {
    dialogue: { character: '', text: '' },
    narration: { text: '' },
    show_character: { characterId: '', position: 'center', expression: 'neutral' },
    hide_character: { characterId: '' },
    character_animation: { characterId: '', animation: 'shake' },
    set_background: { backgroundUri: '' },
    play_music: { musicUri: '', loop: true, volume: 80 },
    play_sfx: { sfxUri: '', volume: 80 },
    play_voice: { voiceUri: '' },
    choice: { text: '', nextSceneId: '' },
    condition: { variable: '', operator: 'equals', value: '' },
    set_variable: { variable: '', value: '' },
    transition: { type: 'fade', duration: 500 },
    wait: { duration: 1000 },
    group: { title: 'Group' },
  };
  return {
    id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    data: defaults[type],
    children: [],
  };
}
