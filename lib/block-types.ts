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

// Schema-based data types for each block type
export interface DialogueData { character: string; text: string; }
export interface NarrationData { text: string; }
export interface ShowCharacterData { characterId: string; position: string; expression: string; }
export interface HideCharacterData { characterId: string; }
export interface CharacterAnimationData { characterId: string; animation: string; }
export interface SetBackgroundData { backgroundUri: string; }
export interface PlayMusicData { musicUri: string; loop: boolean; volume: number; }
export interface PlaySfxData { sfxUri: string; volume: number; }
export interface PlayVoiceData { voiceUri: string; }
export interface ChoiceData { text: string; nextSceneId: string; }
export interface ConditionData { variable: string; operator: string; value: string; }
export interface SetVariableData { variable: string; value: string; }
export interface TransitionData { type: string; duration: number; }
export interface WaitData { duration: number; }
export interface GroupData { title: string; }

// Discriminated union type for Block.data
export type BlockData =
  | DialogueData
  | NarrationData
  | ShowCharacterData
  | HideCharacterData
  | CharacterAnimationData
  | SetBackgroundData
  | PlayMusicData
  | PlaySfxData
  | PlayVoiceData
  | ChoiceData
  | ConditionData
  | SetVariableData
  | TransitionData
  | WaitData
  | GroupData;

// BlockData is also Record<string, unknown> compatible for dynamic access
export type BlockDataRecord = Record<string, unknown>;

export interface Block {
  id: string;
  type: BlockType;
  data: BlockDataRecord;
  children: Block[];
  collapsed?: boolean;
  x?: number;
  y?: number;
  sceneId?: string; // Which scene this block belongs to
}

// Type guards for narrowing Block.data (using runtime type inspection)
// Note: These work because we use `any` for the parameter to bypass index signature constraints
export function isDialogueData(data: unknown): data is DialogueData {
  return data !== null && typeof data === 'object' && 'character' in data && 'text' in data;
}
export function isNarrationData(data: unknown): data is NarrationData {
  return data !== null && typeof data === 'object' && 'text' in data && !('character' in data);
}
export function isShowCharacterData(data: unknown): data is ShowCharacterData {
  return data !== null && typeof data === 'object' && 'characterId' in data && 'position' in data && 'expression' in data;
}
export function isHideCharacterData(data: unknown): data is HideCharacterData {
  return data !== null && typeof data === 'object' && 'characterId' in data && !('position' in data);
}
export function isSetBackgroundData(data: unknown): data is SetBackgroundData {
  return data !== null && typeof data === 'object' && 'backgroundUri' in data;
}
export function isPlayMusicData(data: unknown): data is PlayMusicData {
  return data !== null && typeof data === 'object' && 'musicUri' in data && 'loop' in data;
}
export function isPlaySfxData(data: unknown): data is PlaySfxData {
  return data !== null && typeof data === 'object' && 'sfxUri' in data && !('loop' in data);
}
export function isPlayVoiceData(data: unknown): data is PlayVoiceData {
  return data !== null && typeof data === 'object' && 'voiceUri' in data;
}
export function isChoiceData(data: unknown): data is ChoiceData {
  return data !== null && typeof data === 'object' && 'text' in data && 'nextSceneId' in data;
}
export function isConditionData(data: unknown): data is ConditionData {
  return data !== null && typeof data === 'object' && 'variable' in data && 'operator' in data && 'value' in data;
}
export function isSetVariableData(data: unknown): data is SetVariableData {
  return data !== null && typeof data === 'object' && 'variable' in data && !('operator' in data);
}
export function isTransitionData(data: unknown): data is TransitionData {
  return data !== null && typeof data === 'object' && 'duration' in data && 'type' in data;
}
export function isWaitData(data: unknown): data is WaitData {
  return data !== null && typeof data === 'object' && 'duration' in data && !('type' in data);
}
export function isGroupData(data: unknown): data is GroupData {
  return data !== null && typeof data === 'object' && 'title' in data;
}

// Block-type-discriminated helpers using block.type
export function getDialogueData(block: Block): DialogueData | undefined {
  return block.type === 'dialogue' ? (block.data as unknown as DialogueData) : undefined;
}
export function getNarrationData(block: Block): NarrationData | undefined {
  return block.type === 'narration' ? (block.data as unknown as NarrationData) : undefined;
}
export function getSetBackgroundData(block: Block): SetBackgroundData | undefined {
  return block.type === 'set_background' ? (block.data as unknown as SetBackgroundData) : undefined;
}
export function getPlayMusicData(block: Block): PlayMusicData | undefined {
  return block.type === 'play_music' ? (block.data as unknown as PlayMusicData) : undefined;
}
export function getPlaySfxData(block: Block): PlaySfxData | undefined {
  return block.type === 'play_sfx' ? (block.data as unknown as PlaySfxData) : undefined;
}
export function getPlayVoiceData(block: Block): PlayVoiceData | undefined {
  return block.type === 'play_voice' ? (block.data as unknown as PlayVoiceData) : undefined;
}
export function getChoiceData(block: Block): ChoiceData | undefined {
  return block.type === 'choice' ? (block.data as unknown as ChoiceData) : undefined;
}
export function getGroupData(block: Block): GroupData | undefined {
  return block.type === 'group' ? (block.data as unknown as GroupData) : undefined;
}
export function getShowCharacterData(block: Block): ShowCharacterData | undefined {
  return block.type === 'show_character' ? (block.data as unknown as ShowCharacterData) : undefined;
}
export function getHideCharacterData(block: Block): HideCharacterData | undefined {
  return block.type === 'hide_character' ? (block.data as unknown as HideCharacterData) : undefined;
}
export function getCharacterAnimationData(block: Block): CharacterAnimationData | undefined {
  return block.type === 'character_animation' ? (block.data as unknown as CharacterAnimationData) : undefined;
}
export function getConditionData(block: Block): ConditionData | undefined {
  return block.type === 'condition' ? (block.data as unknown as ConditionData) : undefined;
}
export function getSetVariableData(block: Block): SetVariableData | undefined {
  return block.type === 'set_variable' ? (block.data as unknown as SetVariableData) : undefined;
}
export function getTransitionData(block: Block): TransitionData | undefined {
  return block.type === 'transition' ? (block.data as unknown as TransitionData) : undefined;
}
export function getWaitData(block: Block): WaitData | undefined {
  return block.type === 'wait' ? (block.data as unknown as WaitData) : undefined;
}

// Generic helper to access block data by type
export function getBlockData<T extends BlockData>(block: Block): T | undefined {
  return block.data as unknown as T | undefined;
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
  const defaults: Record<BlockType, BlockDataRecord> = {
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