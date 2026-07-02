import type { BlockType, EffectType, TimelineStep } from '@/lib/engine/types';
import type { RainEffectOptions, SnowEffectOptions } from '@/lib/engine/effect-options';

export type DocumentBlockKind = 'text' | 'dialogue' | 'choice' | 'technical';

export type DocumentCommandId =
  | 'background'
  | 'character'
  | 'newScene'
  | 'music'
  | 'sound'
  | 'transition'
  | 'variable'
  | 'effect'
  | 'camera'
  | 'interactive_object';

export interface DocumentScene {
  sceneId: string;
  sceneName: string;
  blocks: DocumentBlock[];
}

export interface BaseDocumentBlock {
  id: string;
  kind: DocumentBlockKind;
  sourceStepId?: string;
  sourceStep?: TimelineStep;
}

export type DocumentInlinePart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'effect';
      id: string;
      effectType: EffectType;
      target: 'screen' | 'character' | 'background';
      characterId?: string;
      intensity: number;
      duration: number;
      fadeIn?: number;
      fadeOut?: number;
      rain?: RainEffectOptions;
      snow?: SnowEffectOptions;
    };

export interface DocumentTextBlock extends BaseDocumentBlock {
  kind: 'text';
  content: string;
  parts?: DocumentInlinePart[];
}

export interface DocumentDialogueBlock extends BaseDocumentBlock {
  kind: 'dialogue';
  speakerName: string;
  characterId: string | null;
  spriteId: string | null;
  tokenColor?: string;
  openCharacterControls?: boolean;
  text: string;
  parts?: DocumentInlinePart[];
}

export interface DocumentChoiceOption {
  id: string;
  text: string;
  targetSceneId: string | null;
}

export interface DocumentChoiceBlock extends BaseDocumentBlock {
  kind: 'choice';
  question: string;
  options: DocumentChoiceOption[];
}

export interface DocumentTechnicalBlock extends BaseDocumentBlock {
  kind: 'technical';
  commandId: DocumentCommandId;
  blockType: BlockType;
  label: string;
  summary: string;
  step: TimelineStep;
  warning?: string;
}

export type DocumentBlock =
  | DocumentTextBlock
  | DocumentDialogueBlock
  | DocumentChoiceBlock
  | DocumentTechnicalBlock;

export interface DocumentCommand {
  id: DocumentCommandId;
  blockType: BlockType;
  title: string;
  aliases: string[];
  description: string;
  scope: 'scene' | 'character' | 'branch';
}
