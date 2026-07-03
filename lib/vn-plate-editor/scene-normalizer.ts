import type { Character } from '@/lib/character-types';
import {
  createDocumentCharacterDialogueBlock,
  createDocumentTechnicalBlock,
  ensureDocumentCharactersInBlocks,
} from '@/lib/document-editor/document-scene';
import type {
  DocumentBlock,
  DocumentCommandId,
  DocumentInlinePart,
  DocumentScene,
  DocumentTechnicalBlock,
} from '@/lib/document-editor/types';
import { generateId } from '@/lib/id-utils';
import type { BlockType, CharacterBlockData, TimelineStep } from '@/lib/engine/types';

const technicalCommandIds = new Set<DocumentCommandId>([
  'background',
  'character',
  'newScene',
  'music',
  'sound',
  'transition',
  'variable',
  'effect',
  'camera',
  'interactive_object',
]);

const commandIdByBlockType: Record<BlockType, DocumentCommandId> = {
  background: 'background',
  character: 'character',
  text: 'effect',
  dialogue: 'effect',
  choice: 'effect',
  effect: 'effect',
  music: 'music',
  sound: 'sound',
  interactive_object: 'interactive_object',
  camera: 'camera',
  variable: 'variable',
  transition: 'transition',
};

function isTimelineStep(value: unknown): value is TimelineStep {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TimelineStep>;
  return typeof candidate.id === 'string' &&
    typeof candidate.blockType === 'string' &&
    Boolean(candidate.data) &&
    typeof candidate.collapsed === 'boolean' &&
    typeof candidate.enabled === 'boolean';
}

function characterNameForId(characters: Character[], characterId: string | null | undefined): string {
  if (!characterId) return 'Character';
  return characters.find((character) => character.id === characterId)?.name || 'Character';
}

function technicalCharacterToDialogueBlock(
  block: DocumentTechnicalBlock,
  characters: Character[],
): DocumentBlock {
  const data = isTimelineStep(block.step) && block.step.blockType === 'character'
    ? block.step.data as CharacterBlockData
    : null;
  const character = data?.characterId
    ? characters.find((item) => item.id === data.characterId)
    : null;
  return {
    ...createDocumentCharacterDialogueBlock(
      character?.name || block.label || characterNameForId(characters, data?.characterId),
      characters,
    ),
    id: block.id || generateId('doc_dialogue'),
    sourceStepId: block.sourceStepId,
    sourceStep: block.sourceStep,
    characterId: data?.characterId || character?.id || null,
    spriteId: data?.spriteId || character?.authoring?.currentSpriteId || character?.defaultSpriteId || null,
    tokenColor: character?.color,
    openCharacterControls: true,
  };
}

function normalizeTechnicalBlock(block: DocumentTechnicalBlock, characters: Character[]): DocumentBlock {
  if (block.commandId === 'character' || block.blockType === 'character') {
    return technicalCharacterToDialogueBlock(block, characters);
  }

  const step = block.step as TimelineStep | null | undefined;
  if (isTimelineStep(step)) {
    const blockType = block.blockType || step.blockType;
    const commandId = technicalCommandIds.has(block.commandId)
      ? block.commandId
      : commandIdByBlockType[blockType] || 'effect';
    return {
      ...block,
      commandId,
      blockType,
      step,
      label: block.label || commandId,
      summary: block.summary || commandId,
    };
  }

  const commandId = technicalCommandIds.has(block.commandId) ? block.commandId : 'effect';
  const nextBlock = createDocumentTechnicalBlock(commandId, characters);
  return {
    ...nextBlock,
    id: block.id || nextBlock.id,
    sourceStepId: block.sourceStepId,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripSpeakerPrefixFromParts(
  parts: DocumentInlinePart[] | undefined,
  speakerName: string,
): DocumentInlinePart[] | undefined {
  if (!parts?.length) return parts;
  const speakerPattern = new RegExp(`^\\s*${escapeRegExp(speakerName)}:\\s*`);
  let stripped = false;

  return parts.map((part) => {
    if (stripped || part.type !== 'text') return part;
    const text = part.text.replace(speakerPattern, '');
    if (text === part.text) return part;
    stripped = true;
    return { ...part, text };
  });
}

function textBlockToDialogueBlock(block: Extract<DocumentBlock, { kind: 'text' }>, characters: Character[]): DocumentBlock | null {
  const content = block.content || '';
  const trimmed = content.trim();
  const match = /^([^:\n]{1,48}):\s*(.*)$/.exec(trimmed);
  if (!match) return null;

  const speakerName = match[1].trim();
  const text = match[2] || '';
  if (!speakerName || speakerName.startsWith('/')) return null;
  if (/^[a-z][a-z0-9+.-]*$/i.test(speakerName) && text.trim().startsWith('//')) return null;

  return {
    ...createDocumentCharacterDialogueBlock(speakerName, characters),
    id: block.id || generateId('doc_dialogue'),
    sourceStepId: block.sourceStepId,
    sourceStep: block.sourceStep,
    text,
    parts: stripSpeakerPrefixFromParts(block.parts, speakerName),
    openCharacterControls: false,
  };
}

function normalizeBlock(block: DocumentBlock, characters: Character[]): DocumentBlock | null {
  if (block.kind === 'text') {
    const dialogueBlock = textBlockToDialogueBlock(block, characters);
    if (dialogueBlock) return dialogueBlock;

    return {
      id: block.id || generateId('doc_text'),
      kind: 'text',
      sourceStepId: block.sourceStepId,
      sourceStep: block.sourceStep,
      content: block.content || '',
      parts: block.parts,
    };
  }

  if (block.kind === 'dialogue') {
    return {
      id: block.id || generateId('doc_dialogue'),
      kind: 'dialogue',
      sourceStepId: block.sourceStepId,
      sourceStep: block.sourceStep,
      speakerName: block.speakerName || '',
      characterId: block.characterId || null,
      spriteId: block.spriteId || null,
      tokenColor: block.tokenColor,
      openCharacterControls: block.openCharacterControls,
      text: block.text || '',
      parts: block.parts,
    };
  }

  if (block.kind === 'choice') {
    return {
      id: block.id || generateId('doc_choice'),
      kind: 'choice',
      sourceStepId: block.sourceStepId,
      sourceStep: block.sourceStep,
      question: block.question || 'Choice',
      options: block.options?.length
        ? block.options.map((option) => ({
            id: option.id || generateId('choice'),
            text: option.text || 'Option',
            targetSceneId: option.targetSceneId || null,
          }))
        : [
            { id: generateId('choice'), text: 'Option 1', targetSceneId: null },
            { id: generateId('choice'), text: 'Option 2', targetSceneId: null },
          ],
    };
  }

  if (block.kind === 'technical') {
    return normalizeTechnicalBlock(block, characters);
  }

  return null;
}

export function normalizePlateDocumentScene(scene: DocumentScene, characters: Character[]): {
  scene: DocumentScene;
  characters: Character[];
} {
  const blocks = scene.blocks
    .map((block) => normalizeBlock(block, characters))
    .filter((block): block is DocumentBlock => Boolean(block));

  const last = blocks[blocks.length - 1];
  if (!last || last.kind !== 'text' || last.content.trim() !== '') {
    blocks.push({
      id: generateId('doc_text'),
      kind: 'text',
      content: '',
    });
  }

  const ensured = ensureDocumentCharactersInBlocks(blocks, characters);
  return {
    scene: {
      sceneId: scene.sceneId,
      sceneName: scene.sceneName || 'Untitled Scene',
      blocks: ensured.blocks,
    },
    characters: ensured.characters,
  };
}
