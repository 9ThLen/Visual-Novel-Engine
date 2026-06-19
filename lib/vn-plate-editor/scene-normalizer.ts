import type { Character } from '@/lib/character-types';
import {
  createDocumentTechnicalBlock,
  ensureDocumentCharactersInBlocks,
} from '@/lib/document-editor/document-scene';
import type {
  DocumentBlock,
  DocumentCommandId,
  DocumentScene,
  DocumentTechnicalBlock,
} from '@/lib/document-editor/types';
import { generateId } from '@/lib/id-utils';
import type { BlockType, TimelineStep } from '@/lib/engine/types';

const technicalCommandIds = new Set<DocumentCommandId>([
  'background',
  'character',
  'sprite',
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

function normalizeTechnicalBlock(block: DocumentTechnicalBlock, characters: Character[]): DocumentTechnicalBlock {
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

function normalizeBlock(block: DocumentBlock, characters: Character[]): DocumentBlock | null {
  if (block.kind === 'text') {
    return {
      id: block.id || generateId('doc_text'),
      kind: 'text',
      sourceStepId: block.sourceStepId,
      sourceStep: block.sourceStep,
      content: block.content || '',
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
      text: block.text || '',
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
