import type { Character } from '@/lib/character-types';
import { migrateCharacter } from '@/lib/character-migration';
import {
  findCharacterCaseInsensitive,
  normalizeSpeakerNameForDisplay,
} from '@/lib/character-resolver';
import { generateId } from '@/lib/id-utils';
import {
  createBackgroundStep,
  createBlockStep,
  createCharacterStep,
  createChoiceStep,
  createDialogueStep,
  createEffectStep,
  createMusicStep,
  createSoundStep,
  createTextStep,
} from '@/lib/engine/event-factory';
import type {
  BackgroundBlockData,
  CharacterBlockData,
  ChoiceBlockData,
  DialogueBlockData,
  EffectBlockData,
  MusicBlockData,
  SceneConnection,
  SceneRecord,
  SoundBlockData,
  TextBlockData,
  TimelineStep,
} from '@/lib/engine/types';
import { findDocumentCommand, searchDocumentCommands } from './commands';
import type {
  DocumentBlock,
  DocumentCommandId,
  DocumentDialogueBlock,
  DocumentInlinePart,
  DocumentScene,
  DocumentTextBlock,
  DocumentTechnicalBlock,
} from './types';

function characterNameForId(characters: Character[], characterId: string): string {
  return characters.find((character) => character.id === characterId)?.name || characterId || 'Персонаж';
}

function characterForId(characters: Character[], characterId: string | null | undefined): Character | null {
  if (!characterId) return null;
  return characters.find((character) => character.id === characterId) ?? null;
}

function currentSpriteIdForCharacter(character: Character | null): string | null {
  if (!character) return null;
  return character.authoring?.currentSpriteId
    ?? character.defaultSpriteId
    ?? character.sprites[0]?.id
    ?? null;
}

function isDialogueShorthandFalsePositive(speakerName: string, text: string): boolean {
  return /^[a-z][a-z0-9+.-]*$/i.test(speakerName) && text.trimStart().startsWith('//');
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
      sourceStep: step,
      content: data.content,
    };
  }

  if (step.blockType === 'dialogue') {
    const data = step.data as DialogueBlockData;
    const entry = data.entries[0];
    const character = characterForId(characters, entry?.characterId);
    return {
      id: step.id,
      kind: 'dialogue',
      sourceStepId: step.id,
      sourceStep: step,
      speakerName: entry?.characterId ? characterNameForId(characters, entry.characterId) : '',
      characterId: entry?.characterId || null,
      spriteId: entry?.spriteId || null,
      tokenColor: character?.color,
      text: entry?.text || '',
    };
  }

  if (step.blockType === 'choice') {
    const data = step.data as ChoiceBlockData;
    return {
      id: step.id,
      kind: 'choice',
      sourceStepId: step.id,
      sourceStep: step,
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
  if (step.blockType === 'character' && (step.data as CharacterBlockData).generatedByInlineDialogue) {
    return [];
  }

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

function effectStepToInlinePart(step: TimelineStep): DocumentInlinePart | null {
  if (step.blockType !== 'effect') return null;
  const data = step.data as EffectBlockData;
  return {
    type: 'effect',
    id: step.id,
    effectType: data.effectType,
    target: data.target,
    characterId: data.characterId,
    intensity: data.intensity,
    duration: data.duration,
    durationMode: data.durationMode,
    fadeIn: data.fadeIn,
    fadeOut: data.fadeOut,
    rain: data.rain,
    snow: data.snow,
    fog: data.fog,
  };
}

function musicStepToInlinePart(step: TimelineStep): DocumentInlinePart | null {
  if (step.blockType !== 'music') return null;
  const data = step.data as MusicBlockData;
  return {
    type: 'music',
    id: step.id,
    mode: data.mode,
    assetId: data.assetId,
    volume: data.volume,
    loop: data.loop,
    fadeIn: data.fadeIn,
    fadeOut: data.fadeOut,
    boundTo: data.boundTo,
    autoFadeAfter: data.autoFadeAfter,
  };
}

function soundStepToInlinePart(step: TimelineStep): DocumentInlinePart | null {
  if (step.blockType !== 'sound') return null;
  const data = step.data as SoundBlockData;
  return {
    type: 'sound',
    id: step.id,
    mode: data.mode,
    assetId: data.assetId,
    volume: data.volume,
    loop: data.loop,
    fadeIn: data.fadeIn,
    fadeOut: data.fadeOut,
    pitchVariation: data.pitchVariation,
    boundTo: data.boundTo,
  };
}

function timelineStepToInlinePart(step: TimelineStep): DocumentInlinePart | null {
  if (step.blockType === 'effect') return effectStepToInlinePart(step);
  if (step.blockType === 'music') return musicStepToInlinePart(step);
  if (step.blockType === 'sound') return soundStepToInlinePart(step);
  return null;
}

function inlinePartsText(parts: DocumentInlinePart[]): string {
  return parts
    .filter((part): part is Extract<DocumentInlinePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

// Inline chips cannot carry step conditions or the enabled flag, so
// steps that use them must stay technical blocks to avoid silent data loss.
function isInlineSafeStep(step: TimelineStep): boolean {
  return step.enabled !== false && (step.conditions ?? []).length === 0;
}

function mergeInlineChipBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  const result: DocumentBlock[] = [];
  let bufferedBlocks: DocumentBlock[] = [];
  let bufferedParts: DocumentInlinePart[] = [];
  let hasInlineChip = false;

  const flush = () => {
    if (!bufferedBlocks.length) return;
    const firstText = bufferedBlocks.find((block): block is DocumentTextBlock => block.kind === 'text');
    if (hasInlineChip) {
      result.push({
        id: firstText?.id || generateId('doc_text'),
        kind: 'text',
        sourceStepId: firstText?.sourceStepId,
        sourceStep: firstText?.sourceStep,
        content: inlinePartsText(bufferedParts),
        parts: bufferedParts,
      });
    } else {
      result.push(...bufferedBlocks);
    }
    bufferedBlocks = [];
    bufferedParts = [];
    hasInlineChip = false;
  };

  for (const block of blocks) {
    if (block.kind === 'text') {
      bufferedBlocks.push(block);
      bufferedParts.push(...(block.parts ?? [{ type: 'text' as const, text: block.content }]));
      continue;
    }

    if (
      block.kind === 'technical'
      && (block.blockType === 'effect' || block.blockType === 'music' || block.blockType === 'sound')
      && isInlineSafeStep(block.step)
    ) {
      const inlinePart = timelineStepToInlinePart(block.step);
      if (inlinePart) {
        bufferedBlocks.push(block);
        bufferedParts.push(inlinePart);
        hasInlineChip = true;
        continue;
      }
    }

    flush();
    result.push(block);
  }

  flush();
  return result;
}

export function sceneRecordToDocumentScene(sceneRecord: SceneRecord, characters: Character[] = []): DocumentScene {
  const blocks = mergeInlineChipBlocks(sceneRecord.timeline.flatMap((step) => timelineStepToDocumentBlocks(step, characters)));
  // Always ensure a trailing empty text block exists so the user has
  // somewhere to type (replaces the old separate line-draft input).
  // Avoid duplicating if the last block is already an empty text block.
  const lastBlock = blocks[blocks.length - 1];
  if (!lastBlock || lastBlock.kind !== 'text' || lastBlock.content.trim() !== '' || Boolean(lastBlock.parts?.length)) {
    blocks.push({
      id: generateId('doc_text'),
      kind: 'text',
      content: '',
    });
  }
  return {
    sceneId: sceneRecord.id,
    sceneName: sceneRecord.name || 'Untitled Scene',
    blocks,
  };
}

function createTechnicalStep(commandId: DocumentCommandId): TimelineStep {
  if (commandId === 'newScene') return createBlockStep('transition');
  if (commandId === 'background') return createBackgroundStep();
  return createBlockStep(findDocumentCommand(commandId).blockType);
}

export function createDocumentCharacterDialogueBlock(
  speakerName = 'Character',
  characters: Character[] = [],
): DocumentDialogueBlock {
  const normalizedName = normalizeSpeakerNameForDisplay(speakerName) || 'Character';
  const character = findCharacterCaseInsensitive({ current: characters }, 'current', normalizedName);
  return {
    id: generateId('doc_dialogue'),
    kind: 'dialogue',
    speakerName: character?.name || normalizedName,
    characterId: character?.id ?? null,
    spriteId: currentSpriteIdForCharacter(character),
    tokenColor: character?.color,
    openCharacterControls: true,
    text: '',
  };
}

export function createDocumentTechnicalBlock(commandId: DocumentCommandId, characters: Character[] = []): DocumentTechnicalBlock {
  const step = createTechnicalStep(commandId);
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
      if (command.id === 'character') {
        return createDocumentCharacterDialogueBlock('Character', characters);
      }
      return createDocumentTechnicalBlock(command.id, characters);
    }
  }

  const dialogueMatch = /^([^:]{1,48}):\s*(.*)$/.exec(trimmed);
  if (dialogueMatch) {
    const speakerName = normalizeSpeakerNameForDisplay(dialogueMatch[1]);
    const text = dialogueMatch[2].trim();
    if (isDialogueShorthandFalsePositive(speakerName, text)) {
      return {
        id: generateId('doc_text'),
        kind: 'text',
        content: line,
      };
    }
    const character = findCharacterCaseInsensitive({ current: characters }, 'current', speakerName);
    return {
      id: generateId('doc_dialogue'),
      kind: 'dialogue',
      speakerName,
      characterId: character?.id ?? null,
      spriteId: currentSpriteIdForCharacter(character),
      tokenColor: character?.color,
      text,
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
    const speakerName = normalizeSpeakerNameForDisplay(block.speakerName);
    if (!speakerName) return block;
    const currentCharacter = characterForId(nextCharacters, block.characterId);
    if (currentCharacter) {
      return {
        ...block,
        speakerName: currentCharacter.name,
        spriteId: block.spriteId ?? currentSpriteIdForCharacter(currentCharacter),
        tokenColor: currentCharacter.color,
      };
    }
    if (block.characterId) {
      return {
        ...block,
        speakerName,
      };
    }

    const existing = findCharacterCaseInsensitive({ current: nextCharacters }, 'current', speakerName);
    if (existing) {
      return {
        ...block,
        speakerName: existing.name,
        characterId: existing.id,
        spriteId: block.spriteId ?? currentSpriteIdForCharacter(existing),
        tokenColor: existing.color,
      };
    }

    const created = migrateCharacter({
      id: generateId('char', 11),
      name: speakerName,
      sprites: [],
      createdAt: Date.now(),
    });
    nextCharacters.push(created);
    return {
      ...block,
      speakerName: created.name,
      characterId: created.id,
      spriteId: null,
      tokenColor: created.color,
      openCharacterControls: block.openCharacterControls === false ? false : true,
    };
  });

  return { blocks: nextBlocks, characters: nextCharacters };
}

function dialogueStepForBlock(block: DocumentDialogueBlock, characters: Character[]): TimelineStep | null {
  const characterId = block.characterId;
  if (!characterId) return null;
  const character = characterForId(characters, characterId);
  const focusEnabled = character?.authoring?.focusOnSpeak !== false;

  if (block.sourceStep?.blockType === 'dialogue') {
    const sourceData = block.sourceStep.data as DialogueBlockData;
    const entries = sourceData.entries.length
      ? sourceData.entries.map((entry, entryIndex) => entryIndex === 0
        ? {
            ...entry,
            characterId,
            speakerName: block.speakerName,
            spriteId: block.spriteId || '',
            text: block.text,
          }
        : entry)
      : [
          {
            id: generateId('dialogue_entry'),
            characterId,
            speakerName: block.speakerName,
            spriteId: block.spriteId || '',
            text: block.text,
          },
        ];
    return {
      ...block.sourceStep,
      data: {
        ...sourceData,
        entries,
        speakerFocus: focusEnabled
          ? { characterId, enabled: true, scale: 1.04, dimOthers: true }
          : undefined,
      },
    };
  }

  return createDialogueStep({
    entries: [
      {
        id: generateId('dialogue_entry'),
        characterId,
        speakerName: block.speakerName,
        spriteId: block.spriteId || '',
        text: block.text,
      },
    ],
    currentEntryIndex: 0,
    speakerFocus: focusEnabled
      ? { characterId, enabled: true, scale: 1.04, dimOthers: true }
      : undefined,
  });
}

function dialogueStepForInlineText(
  block: DocumentDialogueBlock,
  characters: Character[],
  text: string,
): TimelineStep | null {
  if (!text.trim()) return null;
  const characterId = block.characterId;
  if (!characterId) return null;
  const character = characterForId(characters, characterId);
  const focusEnabled = character?.authoring?.focusOnSpeak !== false;
  return createDialogueStep({
    entries: [
      {
        id: generateId('dialogue_entry'),
        characterId,
        speakerName: block.speakerName,
        spriteId: block.spriteId || '',
        text,
      },
    ],
    currentEntryIndex: 0,
    speakerFocus: focusEnabled
      ? { characterId, enabled: true, scale: 1.04, dimOthers: true }
      : undefined,
  });
}

function textStepFromInlineText(text: string): TimelineStep[] {
  if (!text.trim()) return [];
  return [createTextStep({ content: text })];
}

function effectStepFromInlinePart(part: Extract<DocumentInlinePart, { type: 'effect' }>): TimelineStep {
  return {
    ...createEffectStep({
      effectType: part.effectType,
      target: part.target,
      characterId: part.characterId,
      intensity: part.intensity,
      duration: part.duration,
      durationMode: part.durationMode,
      fadeIn: part.fadeIn,
      fadeOut: part.fadeOut,
      rain: part.rain,
      snow: part.snow,
      fog: part.fog,
    }),
    id: part.id,
  };
}

function musicStepFromInlinePart(part: Extract<DocumentInlinePart, { type: 'music' }>): TimelineStep {
  return {
    ...createMusicStep({
      mode: part.mode,
      assetId: part.assetId,
      volume: part.volume,
      loop: part.loop,
      fadeIn: part.fadeIn,
      fadeOut: part.fadeOut,
      boundTo: part.boundTo,
      autoFadeAfter: part.autoFadeAfter,
    }),
    id: part.id,
  };
}

function soundStepFromInlinePart(part: Extract<DocumentInlinePart, { type: 'sound' }>): TimelineStep {
  return {
    ...createSoundStep({
      mode: part.mode,
      assetId: part.assetId,
      volume: part.volume,
      loop: part.loop,
      fadeIn: part.fadeIn,
      fadeOut: part.fadeOut,
      pitchVariation: part.pitchVariation,
      boundTo: part.boundTo,
    }),
    id: part.id,
  };
}

function timelineStepFromInlineChip(part: Exclude<DocumentInlinePart, { type: 'text' }>): TimelineStep {
  if (part.type === 'effect') return effectStepFromInlinePart(part);
  if (part.type === 'music') return musicStepFromInlinePart(part);
  return soundStepFromInlinePart(part);
}

function timelineFromInlineParts(parts: DocumentInlinePart[]): TimelineStep[] {
  return parts.flatMap((part) => {
    if (part.type === 'text') return textStepFromInlineText(part.text);
    return [timelineStepFromInlineChip(part)];
  });
}

function timelineFromDialogueInlineParts(
  block: DocumentDialogueBlock,
  characters: Character[],
): TimelineStep[] {
  return (block.parts ?? []).flatMap((part) => {
    if (part.type !== 'text') return [timelineStepFromInlineChip(part)];
    const dialogueStep = dialogueStepForInlineText(block, characters, part.text);
    return dialogueStep ? [dialogueStep] : [];
  });
}

function generatedCharacterStepsForDialogue(
  block: DocumentDialogueBlock,
  characters: Character[],
  visibleCharacters: Set<string>,
  currentSpriteByCharacter: Map<string, string>,
  currentPositionByCharacter: Map<string, string>,
): TimelineStep[] {
  if (!block.characterId) return [];
  const character = characterForId(characters, block.characterId);
  const spriteId = block.spriteId || currentSpriteIdForCharacter(character) || '';
  const position = character?.authoring?.currentPosition || 'center';
  const result: TimelineStep[] = [];

  if (!visibleCharacters.has(block.characterId)) {
    result.push(createCharacterStep({
      action: 'show',
      generatedByInlineDialogue: true,
      characterId: block.characterId,
      spriteId,
      position,
      transition: 'fade',
    }));
    visibleCharacters.add(block.characterId);
    currentSpriteByCharacter.set(block.characterId, spriteId);
    currentPositionByCharacter.set(block.characterId, position);
    return result;
  }

  if (currentSpriteByCharacter.get(block.characterId) !== spriteId) {
    result.push(createCharacterStep({
      action: 'change_sprite',
      generatedByInlineDialogue: true,
      characterId: block.characterId,
      spriteId,
      position,
      transition: 'instant',
    }));
    currentSpriteByCharacter.set(block.characterId, spriteId);
  }

  if (currentPositionByCharacter.get(block.characterId) !== position) {
    result.push(createCharacterStep({
      action: 'move',
      generatedByInlineDialogue: true,
      characterId: block.characterId,
      spriteId,
      position,
      transition: 'instant',
    }));
    currentPositionByCharacter.set(block.characterId, position);
  }

  return result;
}

function applyExplicitCharacterState(
  step: TimelineStep,
  visibleCharacters: Set<string>,
  currentSpriteByCharacter: Map<string, string>,
  currentPositionByCharacter: Map<string, string>,
): void {
  if (step.blockType !== 'character') return;
  const data = step.data as CharacterBlockData;
  if (!data.characterId) return;
  const action = data.action || 'show';
  if (action === 'hide') {
    visibleCharacters.delete(data.characterId);
    return;
  }
  visibleCharacters.add(data.characterId);
  if (data.spriteId) currentSpriteByCharacter.set(data.characterId, data.spriteId);
  if (data.position) currentPositionByCharacter.set(data.characterId, data.position);
}

export function documentSceneToTimeline(documentScene: DocumentScene, characters: Character[] = []): TimelineStep[] {
  const visibleCharacters = new Set<string>();
  const currentSpriteByCharacter = new Map<string, string>();
  const currentPositionByCharacter = new Map<string, string>();

  return documentScene.blocks.flatMap((block, index) => {
    if (block.kind === 'technical') {
      applyExplicitCharacterState(block.step, visibleCharacters, currentSpriteByCharacter, currentPositionByCharacter);
      return [block.step];
    }

    if (block.kind === 'text') {
      if (block.parts?.length) {
        return timelineFromInlineParts(block.parts);
      }
      if (!block.sourceStep && index === documentScene.blocks.length - 1 && block.content.trim() === '') {
        return [];
      }
      if (block.sourceStep?.blockType === 'text') {
        return [{
          ...block.sourceStep,
          data: {
            ...(block.sourceStep.data as TextBlockData),
            content: block.content,
          },
        }];
      }
      return [createTextStep({ content: block.content })];
    }

    if (block.kind === 'dialogue') {
      const characterSteps = generatedCharacterStepsForDialogue(
        block,
        characters,
        visibleCharacters,
        currentSpriteByCharacter,
        currentPositionByCharacter,
      );
      if (block.parts?.length) {
        return [
          ...characterSteps,
          ...timelineFromDialogueInlineParts(block, characters),
        ];
      }
      const dialogueStep = dialogueStepForBlock(block, characters);
      return dialogueStep ? [...characterSteps, dialogueStep] : [];
    }

    if (block.kind === 'choice') {
      if (block.sourceStep?.blockType === 'choice') {
        const sourceData = block.sourceStep.data as ChoiceBlockData;
        const sourceOptions = new Map(sourceData.options.map((option) => [option.id, option]));
        return [{
          ...block.sourceStep,
          data: {
            ...sourceData,
            options: block.options.map((option) => ({
              ...sourceOptions.get(option.id),
              id: option.id,
              text: option.text,
              targetSceneId: option.targetSceneId,
            })),
          },
        }];
      }
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
