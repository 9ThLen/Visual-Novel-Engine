import type { Character } from '@/lib/character-types';
import { generateId } from '@/lib/id-utils';
import {
  createBackgroundStep,
  createBlockStep,
  createChoiceStep,
  createDialogueStep,
  createTextStep,
} from '@/lib/engine/event-factory';
import type {
  BackgroundBlockData,
  CharacterBlockData,
  ChoiceBlockData,
  DialogueBlockData,
  SceneConnection,
  SceneRecord,
  TextBlockData,
  TimelineStep,
} from '@/lib/engine/types';
import { findDocumentCommand, searchDocumentCommands } from './commands';
import type {
  DocumentBlock,
  DocumentCommandId,
  DocumentDialogueBlock,
  DocumentScene,
  DocumentTechnicalBlock,
} from './types';

function characterNameForId(characters: Character[], characterId: string): string {
  return characters.find((character) => character.id === characterId)?.name || characterId || 'Персонаж';
}

function commandIdForStep(step: TimelineStep): DocumentCommandId {
  if (step.blockType === 'background') return 'background';
  if (step.blockType === 'character') return 'character';
  if (step.blockType === 'music') return 'music';
  if (step.blockType === 'sound') return 'sound';
  if (step.blockType === 'transition') return 'transition';
  if (step.blockType === 'variable') return 'variable';
  if (step.blockType === 'camera') return 'camera';
  if (step.blockType === 'interactive_object') return 'interactive_object';
  return 'effect';
}

function technicalSummary(step: TimelineStep, characters: Character[]): { label: string; summary: string; warning?: string } {
  if (step.blockType === 'background') {
    const data = step.data as BackgroundBlockData;
    return {
      label: 'Фон',
      summary: data.assetId ? `${data.assetId} · ${data.transition}` : 'не вибрано',
      warning: data.assetId ? undefined : 'Потрібно вибрати фон',
    };
  }

  if (step.blockType === 'character') {
    const data = step.data as CharacterBlockData;
    const name = data.characterId ? characterNameForId(characters, data.characterId) : 'Персонаж';
    return {
      label: name,
      summary: `${data.spriteId || 'default'} · ${data.position}`,
      warning: data.characterId ? undefined : 'Потрібно вибрати персонажа',
    };
  }

  if (step.blockType === 'music') return { label: 'Музика', summary: 'налаштування треку' };
  if (step.blockType === 'sound') return { label: 'Звук', summary: 'звуковий ефект' };
  if (step.blockType === 'transition') return { label: 'Перехід', summary: 'target scene' };
  if (step.blockType === 'variable') return { label: 'Змінна', summary: 'story flag' };
  if (step.blockType === 'effect') return { label: 'Ефект', summary: 'visual effect' };
  if (step.blockType === 'camera') return { label: 'Камера', summary: 'camera movement' };
  if (step.blockType === 'interactive_object') return { label: "Об'єкт", summary: 'interactive hotspot' };

  return { label: step.blockType, summary: 'technical marker' };
}

function timelineStepToDocumentBlock(step: TimelineStep, characters: Character[]): DocumentBlock {
  if (step.blockType === 'text') {
    const data = step.data as TextBlockData;
    return {
      id: step.id,
      kind: 'text',
      sourceStepId: step.id,
      content: data.content,
    };
  }

  if (step.blockType === 'dialogue') {
    const data = step.data as DialogueBlockData;
    const entry = data.entries[0];
    return {
      id: step.id,
      kind: 'dialogue',
      sourceStepId: step.id,
      speakerName: entry?.characterId ? characterNameForId(characters, entry.characterId) : '',
      characterId: entry?.characterId || null,
      spriteId: entry?.spriteId || null,
      text: entry?.text || '',
    };
  }

  if (step.blockType === 'choice') {
    const data = step.data as ChoiceBlockData;
    return {
      id: step.id,
      kind: 'choice',
      sourceStepId: step.id,
      question: 'Що зробити?',
      options: data.options.map((option) => ({
        id: option.id,
        text: option.text,
        targetSceneId: option.targetSceneId,
      })),
    };
  }

  const summary = technicalSummary(step, characters);
  return {
    id: step.id,
    kind: 'technical',
    sourceStepId: step.id,
    commandId: commandIdForStep(step),
    blockType: step.blockType,
    step,
    ...summary,
  };
}

function timelineStepToDocumentBlocks(step: TimelineStep, characters: Character[]): DocumentBlock[] {
  if (step.blockType !== 'text') {
    return [timelineStepToDocumentBlock(step, characters)];
  }

  const data = step.data as TextBlockData;
  const lines = data.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return [timelineStepToDocumentBlock(step, characters)];
  }

  return lines.map((line) => parseDraftLineToDocumentBlock(line, characters));
}

export function sceneRecordToDocumentScene(sceneRecord: SceneRecord, characters: Character[] = []): DocumentScene {
  return {
    sceneId: sceneRecord.id,
    sceneName: sceneRecord.name || 'Untitled Scene',
    blocks: sceneRecord.timeline.flatMap((step) => timelineStepToDocumentBlocks(step, characters)),
  };
}

function createTechnicalStep(commandId: DocumentCommandId, speaker?: DocumentDialogueBlock): TimelineStep {
  if (commandId === 'newScene') return createBlockStep('transition');
  if (commandId === 'background') return createBackgroundStep();
  if (commandId === 'character' || commandId === 'sprite') {
    const step = createBlockStep('character');
    return {
      ...step,
      data: {
        ...(step.data as CharacterBlockData),
        characterId: speaker?.characterId || '',
        spriteId: speaker?.spriteId || '',
      },
    };
  }

  return createBlockStep(findDocumentCommand(commandId).blockType);
}

export function createDocumentTechnicalBlock(commandId: DocumentCommandId, characters: Character[] = [], speaker?: DocumentDialogueBlock): DocumentTechnicalBlock {
  const step = createTechnicalStep(commandId, speaker);
  const summary = technicalSummary(step, characters);
  return {
    id: generateId('doc_block'),
    kind: 'technical',
    commandId,
    blockType: step.blockType,
    step,
    ...summary,
  };
}

export function refreshDocumentTechnicalBlock(block: DocumentTechnicalBlock, characters: Character[] = []): DocumentTechnicalBlock {
  return {
    ...block,
    ...technicalSummary(block.step, characters),
  };
}

export function parseDraftLineToDocumentBlock(line: string, characters: Character[]): DocumentBlock {
  const trimmed = line.trim();
  if (trimmed.startsWith('/')) {
    const command = searchDocumentCommands(trimmed).find((item) =>
      item.aliases.some((alias) => alias.toLocaleLowerCase() === trimmed.slice(1).toLocaleLowerCase()) ||
      item.title.toLocaleLowerCase() === trimmed.slice(1).toLocaleLowerCase()
    ) ?? searchDocumentCommands(trimmed)[0];

    if (command) {
      return createDocumentTechnicalBlock(command.id, characters);
    }
  }

  const dialogueMatch = /^([^:]{1,48}):\s*(.+)$/.exec(trimmed);
  if (dialogueMatch) {
    const speakerName = dialogueMatch[1].trim();
    const character = characters.find((item) => item.name.toLocaleLowerCase() === speakerName.toLocaleLowerCase());
    return {
      id: generateId('doc_dialogue'),
      kind: 'dialogue',
      speakerName,
      characterId: character?.id ?? null,
      spriteId: character?.defaultSpriteId ?? null,
      text: dialogueMatch[2].trim(),
    };
  }

  if (trimmed.startsWith('?')) {
    return {
      id: generateId('doc_choice'),
      kind: 'choice',
      question: trimmed.slice(1).trim() || 'Що зробити?',
      options: [
        { id: generateId('choice'), text: 'Варіант 1', targetSceneId: null },
        { id: generateId('choice'), text: 'Варіант 2', targetSceneId: null },
      ],
    };
  }

  return {
    id: generateId('doc_text'),
    kind: 'text',
    content: line,
  };
}

export function ensureDocumentCharacters(blocks: DocumentBlock[], characters: Character[]): Character[] {
  const result = ensureDocumentCharactersInBlocks(blocks, characters);
  result.blocks.forEach((block, index) => {
    if (blocks[index] && blocks[index].kind === block.kind) {
      Object.assign(blocks[index], block);
    }
    blocks[index] = block;
  });
  return result.characters;
}

export function ensureDocumentCharactersInBlocks(
  blocks: DocumentBlock[],
  characters: Character[]
): { blocks: DocumentBlock[]; characters: Character[] } {
  const nextCharacters = [...characters];
  const nextBlocks = blocks.map((block) => {
    if (block.kind !== 'dialogue') return block;
    const speakerName = block.speakerName.trim();
    if (!speakerName) return block;

    const existing = nextCharacters.find((item) => item.name.toLocaleLowerCase() === speakerName.toLocaleLowerCase());
    if (existing) {
      return {
        ...block,
        characterId: existing.id,
        spriteId: block.spriteId ?? existing.defaultSpriteId ?? null,
      };
    }

    const created: Character = {
      id: generateId('char', 11),
      name: speakerName,
      sprites: [],
      createdAt: Date.now(),
    };
    nextCharacters.push(created);
    return {
      ...block,
      characterId: created.id,
      spriteId: null,
    };
  });

  return { blocks: nextBlocks, characters: nextCharacters };
}

export function documentSceneToTimeline(documentScene: DocumentScene): TimelineStep[] {
  return documentScene.blocks.flatMap((block) => {
    if (block.kind === 'technical') {
      return [block.step];
    }

    if (block.kind === 'text') {
      return [createTextStep({ content: block.content })];
    }

    if (block.kind === 'dialogue') {
      return [
        createDialogueStep({
          entries: [
            {
              id: generateId('dialogue_entry'),
              characterId: block.characterId || block.speakerName,
              spriteId: block.spriteId || '',
              text: block.text,
            },
          ],
          currentEntryIndex: 0,
        }),
      ];
    }

    if (block.kind === 'choice') {
      return [
        createChoiceStep({
          options: block.options.map((option) => ({
            id: option.id,
            text: option.text,
            targetSceneId: option.targetSceneId,
          })),
        }),
      ];
    }

    return [];
  });
}

export function documentSceneToConnections(documentScene: DocumentScene, nextSceneId?: string): SceneConnection[] {
  const choiceConnections = documentScene.blocks.flatMap((block) => {
    if (block.kind !== 'choice') return [];
    return block.options
      .filter((option) => option.targetSceneId)
      .map((option) => ({
        targetSceneId: option.targetSceneId!,
        outputPort: option.id,
        label: option.text,
      }));
  });

  return [
    ...choiceConnections,
    ...(nextSceneId ? [{ targetSceneId: nextSceneId, outputPort: 'next', label: 'Next' }] : []),
  ];
}

export function orderSceneRecordsForDocument(scenes: SceneRecord[]): SceneRecord[] {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const visited = new Set<string>();
  const ordered: SceneRecord[] = [];
  const startScene = scenes.find((scene) => scene.isStart) ?? scenes[0];

  let current: SceneRecord | undefined = startScene;
  while (current && !visited.has(current.id)) {
    ordered.push(current);
    visited.add(current.id);
    const nextSceneId: string | undefined = current.connections?.find((connection) => connection.outputPort === 'next')?.targetSceneId;
    current = nextSceneId ? byId.get(nextSceneId) : undefined;
  }

  const remaining = scenes
    .filter((scene) => !visited.has(scene.id))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  return [...ordered, ...remaining];
}
