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
import { CAMERA_ACTION_LABELS, normalizeCameraData } from '@/lib/engine/camera-utils';
import { normalizeTransitionData } from '@/lib/engine/transition-utils';
import type {
  BackgroundBlockData,
  CharacterBlockData,
  ChoiceBlockData,
  DialogueBlockData,
  EffectBlockData,
  GotoBlockData,
  LabelBlockData,
  MusicBlockData,
  SceneConnection,
  SceneRecord,
  SoundBlockData,
  StopEffectBlockData,
  TextBlockData,
  TimelineStep,
  VideoBlockData,
} from '@/lib/engine/types';
import { normalizeVideoData } from '@/lib/engine/video-utils';
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
  if (step.blockType === 'video') return 'video';
  if (step.blockType === 'character') return 'character';
  if (step.blockType === 'music') return 'music';
  if (step.blockType === 'sound') return 'sound';
  if (step.blockType === 'transition') return 'transition';
  if (step.blockType === 'variable') return 'variable';
  if (step.blockType === 'camera') return 'camera';
  if (step.blockType === 'interactive_object') return 'interactive_object';
  if (step.blockType === 'label') return 'label';
  if (step.blockType === 'goto') return 'goto';
  if (step.blockType === 'stop_effect') return 'stopEffect';
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

  if (step.blockType === 'video') {
    const data = normalizeVideoData(step.data as VideoBlockData);
    return {
      label: data.mode === 'stop' ? 'Зупинити відео' : 'Відео',
      summary: data.mode === 'stop'
        ? data.layer
        : `${data.assetId || 'не вибрано'} · ${data.layer} · ${data.fit}`,
      warning: data.mode === 'play' && !data.assetId ? 'Потрібно вибрати відео' : undefined,
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
  if (step.blockType === 'transition') {
    const data = normalizeTransitionData(step.data);
    const target = data.mode === 'end'
      ? 'кінець історії'
      : data.mode === 'scene'
        ? (data.targetSceneId || 'сцену не вибрано')
        : 'наступна сцена';
    return {
      label: 'Перехід',
      summary: `${target} · ${data.transitionType} · ${data.duration}s`,
      warning: data.mode === 'scene' && !data.targetSceneId ? 'Потрібно вибрати сцену' : undefined,
    };
  }
  if (step.blockType === 'variable') return { label: 'Змінна', summary: 'story flag' };
  if (step.blockType === 'label') {
    const data = step.data as LabelBlockData;
    return {
      label: 'Мітка',
      summary: data.name || 'без назви',
      warning: data.name ? undefined : 'Потрібно вказати назву мітки',
    };
  }
  if (step.blockType === 'goto') {
    const data = step.data as GotoBlockData;
    const condition = data.condition
      ? `якщо ${data.condition.variableName} ${data.condition.operator} ${String(data.condition.value)}`
      : 'завжди';
    return {
      label: 'Перейти',
      summary: `→ ${data.targetLabel || 'мітку не вибрано'} · ${condition}${data.elseTargetLabel ? ` · інакше → ${data.elseTargetLabel}` : ''}`,
      warning: data.targetLabel ? undefined : 'Потрібно вибрати мітку',
    };
  }
  if (step.blockType === 'effect') return { label: 'Ефект', summary: 'visual effect' };
  if (step.blockType === 'stop_effect') {
    const data = step.data as StopEffectBlockData;
    const typeLabel = data.effectType === 'all' ? 'усі ефекти' : data.effectType;
    const targetLabel = !data.target || data.target === 'all' ? '' : ` · ${data.target}`;
    return { label: 'Стоп-ефект', summary: `${typeLabel}${targetLabel}` };
  }
  if (step.blockType === 'camera') {
    const data = normalizeCameraData(step.data);
    const action = CAMERA_ACTION_LABELS[data.action] || data.action;
    const focus = data.action === 'focus'
      ? ` · ${data.target ? characterNameForId(characters, data.target) : 'персонажа не вибрано'}`
      : '';
    const zoom = data.action !== 'reset' && typeof data.zoomLevel === 'number'
      ? ` · ${Number(data.zoomLevel.toFixed(2))}×`
      : '';
    return {
      label: 'Камера',
      summary: `${action}${focus}${zoom} · ${Number(data.duration.toFixed(2))}s`,
      warning: data.action === 'focus' && !data.target ? 'Потрібно вибрати персонажа' : undefined,
    };
  }
  if (step.blockType === 'interactive_object') return { label: "Об'єкт", summary: 'interactive hotspot' };

  return { label: step.blockType, summary: 'technical marker' };
}

/**
 * The id a step's block opens under. A step that stands for its whole block
 * gives the block back the id it was saved from; a step made from one part of
 * a block is put back together with the rest of that block by
 * `regroupBlocks`, and a step saved before blocks were remembered opens under
 * its own id, as it always did.
 */
function blockIdForStep(step: TimelineStep): string {
  return step.originBlockId && step.originPart === undefined ? step.originBlockId : step.id;
}

function timelineStepToDocumentBlock(step: TimelineStep, characters: Character[]): DocumentBlock {
  if (step.blockType === 'text') {
    const data = step.data as TextBlockData;
    return {
      id: blockIdForStep(step),
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
      id: blockIdForStep(step),
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
      id: blockIdForStep(step),
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
    id: blockIdForStep(step),
    kind: 'technical',
    sourceStepId: step.id,
    sourceStep: step,
    commandId: commandIdForStep(step),
    blockType: step.blockType,
    step,
    ...summary,
  };
}

function timelineStepToDocumentBlocks(step: TimelineStep, characters: Character[]): DocumentBlock[] {
  // Persist every canonical character step so an editor save is lossless.

  return [timelineStepToDocumentBlock(step, characters)];
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

function inlineChipPart(block: DocumentBlock): DocumentInlinePart | null {
  if (block.kind !== 'technical') return null;
  if (block.blockType !== 'effect' && block.blockType !== 'music' && block.blockType !== 'sound') return null;
  return isInlineSafeStep(block.step) ? timelineStepToInlinePart(block.step) : null;
}

/** The block a step made from one of its parts belongs to, if the step says so. */
function partOrigin(block: DocumentBlock): string | undefined {
  const step = block.sourceStep;
  if (!step?.originBlockId || step.originPart === undefined) return undefined;
  if (block.kind === 'text' || block.kind === 'dialogue' || inlineChipPart(block)) return step.originBlockId;
  return undefined;
}

/**
 * One block put back together from the steps its parts were saved as, in
 * their order. A run of text that held only spaces is not saved as a step;
 * it comes back as a space, so the parts keep the numbers they were saved
 * under.
 */
function blockFromSavedParts(blockId: string, members: DocumentBlock[]): DocumentBlock {
  const parts: DocumentInlinePart[] = [];
  let hasChip = false;
  for (const member of members) {
    const at = member.sourceStep?.originPart ?? parts.length;
    while (parts.length < at) parts.push({ type: 'text', text: ' ' });
    if (member.kind === 'text') parts.push({ type: 'text', text: member.content });
    else if (member.kind === 'dialogue') parts.push({ type: 'text', text: member.text });
    else {
      const chip = inlineChipPart(member);
      if (chip) {
        parts.push(chip);
        hasChip = true;
      }
    }
  }
  const content = inlinePartsText(parts);
  const dialogue = members.find((member): member is DocumentDialogueBlock => member.kind === 'dialogue');
  if (dialogue) return { ...dialogue, id: blockId, text: content, parts };
  const firstText = members.find((member): member is DocumentTextBlock => member.kind === 'text');
  return {
    id: blockId,
    kind: 'text',
    sourceStepId: firstText?.sourceStepId,
    sourceStep: firstText?.sourceStep,
    content,
    ...(hasChip || parts.length > 1 ? { parts } : {}),
  };
}

/**
 * Puts the steps of a scene back into the blocks they were saved from.
 *
 * Steps that name the block they came from are grouped by it, and by nothing
 * else: steps of two blocks stay two blocks, whatever lies between them. A
 * step saved before blocks were remembered names none; such steps are grouped
 * as they always were — a run of text with an inline chip in it becomes one
 * line, and lines with no chip stay apart.
 */
function regroupBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  const result: DocumentBlock[] = [];
  let group: DocumentBlock[] = [];
  let groupOrigin: string | undefined;
  let legacyParts: DocumentInlinePart[] = [];
  let legacyHasChip = false;

  const flush = () => {
    if (!group.length) return;
    if (groupOrigin) {
      result.push(blockFromSavedParts(groupOrigin, group));
    } else if (legacyHasChip) {
      const firstText = group.find((block): block is DocumentTextBlock => block.kind === 'text');
      result.push({
        id: firstText?.id || generateId('doc_text'),
        kind: 'text',
        sourceStepId: firstText?.sourceStepId,
        sourceStep: firstText?.sourceStep,
        content: inlinePartsText(legacyParts),
        parts: legacyParts,
      });
    } else {
      result.push(...group);
    }
    group = [];
    groupOrigin = undefined;
    legacyParts = [];
    legacyHasChip = false;
  };

  for (const block of blocks) {
    const origin = partOrigin(block);
    if (origin) {
      if (!group.length || groupOrigin !== origin) flush();
      groupOrigin = origin;
      group.push(block);
      continue;
    }
    const chip = inlineChipPart(block);
    const legacy = !block.sourceStep?.originBlockId && (block.kind === 'text' || chip);
    if (legacy) {
      if (groupOrigin) flush();
      group.push(block);
      legacyParts.push(...(block.kind === 'text' ? (block.parts ?? [{ type: 'text' as const, text: block.content }]) : [chip!]));
      if (chip) legacyHasChip = true;
      continue;
    }
    flush();
    result.push(block);
  }
  flush();

  // A block id is one block's: should two steps somewhere name the same
  // block apart from each other, the later one opens under its own step id.
  const used = new Set<string>();
  return result.map((block) => {
    if (!used.has(block.id)) {
      used.add(block.id);
      return block;
    }
    const id = block.sourceStep && !used.has(block.sourceStep.id) ? block.sourceStep.id : generateId('doc_block');
    used.add(id);
    return { ...block, id };
  });
}

/**
 * A scene can have been stored with two steps under one id, by an older
 * editor or a copy that kept its original's. Each is saved under the id it
 * opens with, so the later one opens under an id of its own: the first keeps
 * the id, and the scene is set right by its next save. Block ids could once
 * show the twins to the editor; a block now opens under the id it was saved
 * from, and two twins can have been saved from two blocks.
 */
function withOwnStepIds(timeline: TimelineStep[]): TimelineStep[] {
  const seen = new Set<string>();
  return timeline.map((step) => {
    if (!seen.has(step.id)) {
      seen.add(step.id);
      return step;
    }
    const id = generateId('step');
    seen.add(id);
    return { ...step, id };
  });
}

export function sceneRecordToDocumentScene(sceneRecord: SceneRecord, characters: Character[] = []): DocumentScene {
  const blocks = regroupBlocks(withOwnStepIds(sceneRecord.timeline).flatMap((step) => timelineStepToDocumentBlocks(step, characters)));
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

/** Takes a step made from one part of a block and gives back the step as it is saved. */
type OnPartStep = (step: TimelineStep, partIndex: number) => TimelineStep;

function timelineFromInlineParts(
  parts: DocumentInlinePart[],
  onTextStep: OnPartStep,
  onChipStep: OnPartStep,
): TimelineStep[] {
  return parts.flatMap((part, partIndex) => {
    if (part.type !== 'text') return [onChipStep(timelineStepFromInlineChip(part), partIndex)];
    return textStepFromInlineText(part.text).map((step) => onTextStep(step, partIndex));
  });
}

function timelineFromDialogueInlineParts(
  block: DocumentDialogueBlock,
  characters: Character[],
  onDialogueStep: OnPartStep,
  onChipStep: OnPartStep,
): TimelineStep[] {
  return (block.parts ?? []).flatMap((part, partIndex) => {
    if (part.type !== 'text') return [onChipStep(timelineStepFromInlineChip(part), partIndex)];
    const dialogueStep = dialogueStepForInlineText(block, characters, part.text);
    return dialogueStep ? [onDialogueStep(dialogueStep, partIndex)] : [];
  });
}

/**
 * The step as it is saved from a block: it carries the block's id, and the
 * part it came from when the block has parts. A step loaded from the store
 * may carry another block's id from before a split or a merge; the block it
 * is saved from now is the one it names. A step that is its whole block under
 * the block's own id says nothing new and is saved without either, so a scene
 * whose blocks all came from the store saves exactly as it was.
 */
function savedFromBlock(step: TimelineStep, blockId: string, partIndex: number | null): TimelineStep {
  const { originBlockId: _formerBlock, originPart: _formerPart, ...rest } = step;
  if (partIndex === null) return blockId === step.id ? rest : { ...rest, originBlockId: blockId };
  return { ...rest, originBlockId: blockId, originPart: partIndex };
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
  const entranceTransition = block.characterAction === 'hide'
    ? character?.authoring?.entranceTransition || 'fade'
    : block.characterTransition || character?.authoring?.entranceTransition || 'fade';
  const result: TimelineStep[] = [];

  if (!visibleCharacters.has(block.characterId)) {
    result.push(createCharacterStep({
      action: 'show',
      generatedByInlineDialogue: true,
      characterId: block.characterId,
      spriteId,
      position,
      transition: entranceTransition,
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

function generatedCharacterHideStep(
  block: DocumentDialogueBlock,
  characters: Character[],
): TimelineStep | null {
  if (!block.characterId || block.characterAction !== 'hide') return null;
  const character = characterForId(characters, block.characterId);
  return createCharacterStep({
    action: 'hide',
    generatedByInlineDialogue: true,
    characterId: block.characterId,
    spriteId: block.spriteId || currentSpriteIdForCharacter(character) || '',
    position: character?.authoring?.currentPosition || 'center',
    transition: block.characterTransition || character?.authoring?.exitTransition || 'fade',
  });
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

/**
 * Where a text-bearing step of a converted timeline came from in the document.
 *
 * Step ids do not survive a save: a block typed in this session, and every
 * text part of a block carrying inline chips, becomes a fresh step each time.
 * The pairing is therefore reported by the same pass that mints the ids.
 */
export interface DocumentStepOrigin {
  stepId: string;
  blockId: string;
  /** Index into the block's `parts`; null when the block has no inline parts. */
  partIndex: number | null;
  field: 'content' | 'entryText';
  /** The dialogue entry holding the text, when `field` is `entryText`. */
  entryId?: string;
}

/**
 * Which block a step that carries no text is: a technical block, a choice, or
 * an inline chip of a text block. Kept apart from `DocumentStepOrigin` because
 * these are addressed whole — there is no quote inside them to point at.
 */
export interface DocumentBlockStep {
  stepId: string;
  blockId: string;
  /** Index into the block's `parts` for an inline chip; null for a block that is one step. */
  partIndex: number | null;
}

export function documentSceneToTimelineWithOrigins(
  documentScene: DocumentScene,
  characters: Character[] = [],
): { timeline: TimelineStep[]; origins: DocumentStepOrigin[]; blockSteps: DocumentBlockStep[] } {
  const visibleCharacters = new Set<string>();
  const currentSpriteByCharacter = new Map<string, string>();
  const currentPositionByCharacter = new Map<string, string>();
  const origins: DocumentStepOrigin[] = [];
  const blockSteps: DocumentBlockStep[] = [];
  const recordBlock = (step: TimelineStep, blockId: string, partIndex: number | null = null): TimelineStep => {
    blockSteps.push({ stepId: step.id, blockId, partIndex });
    return savedFromBlock(step, blockId, partIndex);
  };
  const recordText = (step: TimelineStep, blockId: string, partIndex: number | null): TimelineStep => {
    origins.push({ stepId: step.id, blockId, partIndex, field: 'content' });
    return savedFromBlock(step, blockId, partIndex);
  };
  const recordDialogue = (step: TimelineStep, blockId: string, partIndex: number | null): TimelineStep => {
    const entryId = (step.data as DialogueBlockData).entries[0]?.id;
    origins.push({ stepId: step.id, blockId, partIndex, field: 'entryText', ...(entryId ? { entryId } : {}) });
    return savedFromBlock(step, blockId, partIndex);
  };

  const timeline = documentScene.blocks.flatMap((block, index) => {
    if (block.kind === 'technical') {
      applyExplicitCharacterState(block.step, visibleCharacters, currentSpriteByCharacter, currentPositionByCharacter);
      return [recordBlock(block.step, block.id)];
    }

    if (block.kind === 'text') {
      if (block.parts?.length) {
        return timelineFromInlineParts(
          block.parts,
          (step, partIndex) => recordText(step, block.id, partIndex),
          (step, partIndex) => recordBlock(step, block.id, partIndex),
        );
      }
      if (!block.sourceStep && index === documentScene.blocks.length - 1 && block.content.trim() === '') {
        return [];
      }
      const textStep: TimelineStep = block.sourceStep?.blockType === 'text'
        ? {
            ...block.sourceStep,
            data: {
              ...(block.sourceStep.data as TextBlockData),
              content: block.content,
            },
          }
        : createTextStep({ content: block.content });
      return [recordText(textStep, block.id, null)];
    }

    if (block.kind === 'dialogue') {
      if (block.sourceStep?.blockType === 'character') {
        const sourceData = block.sourceStep.data as CharacterBlockData;
        const step: TimelineStep = {
          ...block.sourceStep,
          data: {
            ...sourceData,
            action: block.characterAction ?? sourceData.action,
            characterId: block.characterId ?? sourceData.characterId,
            spriteId: block.spriteId ?? sourceData.spriteId,
            transition: block.characterTransition ?? sourceData.transition,
          },
        };
        applyExplicitCharacterState(step, visibleCharacters, currentSpriteByCharacter, currentPositionByCharacter);
        return [step];
      }
      const characterSteps = generatedCharacterStepsForDialogue(
        block,
        characters,
        visibleCharacters,
        currentSpriteByCharacter,
        currentPositionByCharacter,
      );
      const hideStep = generatedCharacterHideStep(block, characters);
      const contentSteps = block.parts?.length
        ? timelineFromDialogueInlineParts(
            block,
            characters,
            (step, partIndex) => recordDialogue(step, block.id, partIndex),
            (step, partIndex) => recordBlock(step, block.id, partIndex),
          )
        : (() => {
            const dialogueStep = dialogueStepForBlock(block, characters);
            return dialogueStep ? [recordDialogue(dialogueStep, block.id, null)] : [];
          })();
      if (hideStep) {
        applyExplicitCharacterState(hideStep, visibleCharacters, currentSpriteByCharacter, currentPositionByCharacter);
      }
      return [...characterSteps, ...contentSteps, ...(hideStep ? [hideStep] : [])];
    }

    if (block.kind === 'choice') {
      if (block.sourceStep?.blockType === 'choice') {
        const sourceData = block.sourceStep.data as ChoiceBlockData;
        const sourceOptions = new Map(sourceData.options.map((option) => [option.id, option]));
        return [recordBlock({
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
        }, block.id)];
      }
      // A new choice is saved under its block's id: the frame knows a choice's
      // branch only by the id of its block, and the story knows it by its step's.
      return [
        recordBlock({
          ...createChoiceStep({
            options: block.options.map((option) => ({
              id: option.id,
              text: option.text,
              targetSceneId: option.targetSceneId,
            })),
          }),
          id: block.id,
        }, block.id),
      ];
    }

    return [];
  });

  return { timeline, origins, blockSteps };
}

export function documentSceneToTimeline(documentScene: DocumentScene, characters: Character[] = []): TimelineStep[] {
  return documentSceneToTimelineWithOrigins(documentScene, characters).timeline;
}

/**
 * Resolves the `next` target to persist for a scene on save.
 *
 * The scene's existing `next` connection always wins: the document's render
 * order must never rewrite graph edges (under active-path rendering the
 * document neighbor of a choice scene is the selected branch's first scene,
 * and writing it as `next` would corrupt the null-option fallback). The
 * positional neighbor is only a fallback for scenes that have no `next` yet —
 * today that weaves appended orphan scenes into the chain on save.
 */
export function resolveNextSceneIdForSave(
  sourceRecord: Pick<SceneRecord, 'connections'>,
  positionalNextSceneId: string | undefined,
): string | undefined {
  const existing = sourceRecord.connections?.find((connection) => connection.outputPort === 'next');
  return existing?.targetSceneId ?? positionalNextSceneId;
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

  // The first enabled transition block owns the `next` connection, matching
  // executor behavior: transition halts scene execution.
  const transitionBlock = documentScene.blocks.find(
    (block): block is Extract<DocumentBlock, { kind: 'technical' }> =>
      block.kind === 'technical'
      && block.step?.blockType === 'transition'
      && block.step.enabled !== false,
  );
  let nextTarget: string | null = nextSceneId ?? null;
  if (transitionBlock) {
    const data = normalizeTransitionData(transitionBlock.step.data);
    if (data.mode === 'end') nextTarget = null;
    else if (data.mode === 'scene') nextTarget = data.targetSceneId;
  }

  return [
    ...choiceConnections,
    ...(nextTarget ? [{ targetSceneId: nextTarget, outputPort: 'next', label: 'Next' }] : []),
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
