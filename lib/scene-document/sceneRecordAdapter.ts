import { generateId } from '@/lib/id-utils';
import {
  createBackgroundStep,
  createCameraStep,
  createCharacterStep,
  createChoiceStep,
  createDialogueEntry,
  createDialogueStep,
  createEffectStep,
  createInteractiveObjectStep,
  createMusicStep,
  createSoundStep,
  createTextStep,
  createTransitionStep,
  createVariableStep,
} from '@/lib/engine/event-factory';
import type {
  BackgroundBlockData,
  CameraBlockData,
  CharacterBlockData,
  ChoiceBlockData,
  DialogueBlockData,
  EffectBlockData,
  InteractiveObjectBlockData,
  MusicBlockData,
  SceneConnection,
  SceneRecord,
  SoundBlockData,
  TextBlockData,
  TimelineStep,
  TransitionBlockData,
  VariableBlockData,
} from '@/lib/engine/types';
import type { Character } from '@/lib/character-types';
import type { SceneDocument, SceneNode } from './sceneTypes';

function characterNameForId(characters: Character[], characterId: string): string {
  return characters.find((character) => character.id === characterId)?.name || characterId;
}

function timelineStepToSceneNode(step: TimelineStep, characters: Character[]): SceneNode {
  if (step.blockType === 'text') {
    return {
      id: step.id,
      type: 'narration',
      text: (step.data as TextBlockData).content,
    };
  }

  if (step.blockType === 'dialogue') {
    const entry = (step.data as DialogueBlockData).entries[0];
    const characterName = entry?.characterId ? characterNameForId(characters, entry.characterId) : '';
    return {
      id: step.id,
      type: 'dialogue',
      characterName,
      text: entry?.text ?? '',
    };
  }

  if (step.blockType === 'background') {
    const data = step.data as BackgroundBlockData;
    return {
      id: step.id,
      type: 'background',
      assetId: data.assetId ?? '',
      transition: data.transition === 'instant' ? 'cut' : data.transition === 'wipe' ? 'slide' : 'fade',
      durationMs: data.duration,
    };
  }

  if (step.blockType === 'character') {
    const data = step.data as CharacterBlockData;
    return {
      id: step.id,
      type: 'character',
      characterId: data.characterId,
      spriteId: data.spriteId || undefined,
      action: data.effect?.type === 'hide' ? 'hide' : 'show',
      position: data.position,
      transition: data.transition,
      delay: data.delay,
      duration: data.duration,
    };
  }

  if (step.blockType === 'music') {
    const data = step.data as MusicBlockData;
    return {
      id: step.id,
      type: 'music',
      action: data.action,
      assetId: data.assetId ?? undefined,
      volume: data.volume,
      loop: data.loop,
      fadeDuration: data.fadeDuration,
    };
  }

  if (step.blockType === 'sound') {
    const data = step.data as SoundBlockData;
    return {
      id: step.id,
      type: 'sound',
      action: data.action,
      assetId: data.assetId ?? undefined,
      volume: data.volume,
      loop: data.loop,
      pitchVariation: data.pitchVariation,
    };
  }

  if (step.blockType === 'choice') {
    const data = step.data as ChoiceBlockData;
    return {
      id: step.id,
      type: 'choice',
      options: data.options.map((option) => ({
        id: option.id,
        label: option.text,
        targetSceneId: option.targetSceneId ?? undefined,
      })),
    };
  }

  if (step.blockType === 'transition') {
    const data = step.data as TransitionBlockData;
    return {
      id: step.id,
      type: 'transition',
      targetSceneId: data.targetSceneId,
      transitionType: data.transitionType,
      duration: data.duration,
    };
  }

  if (step.blockType === 'variable') {
    const data = step.data as VariableBlockData;
    return {
      id: step.id,
      type: 'variable',
      variableName: data.variableName,
      operation: data.operation,
      value: data.value,
    };
  }

  if (step.blockType === 'effect') {
    const data = step.data as EffectBlockData;
    return {
      id: step.id,
      type: 'effect',
      effectType: data.effectType,
      target: data.target,
      characterId: data.characterId,
      intensity: data.intensity,
      durationMs: data.duration * 1000,
      rain: data.rain,
      snow: data.snow,
      fog: data.fog,
    };
  }

  if (step.blockType === 'camera') {
    const data = step.data as CameraBlockData;
    return {
      id: step.id,
      type: 'camera',
      action: data.action,
      target: data.target,
      zoomLevel: data.zoomLevel,
      panX: data.panX,
      panY: data.panY,
      duration: data.duration,
      easing: data.easing,
    };
  }

  if (step.blockType === 'interactive_object') {
    const data = step.data as InteractiveObjectBlockData;
    return {
      id: step.id,
      type: 'interactive_object',
      objectId: data.objectId,
      name: data.name,
      assetId: data.assetId,
      position: data.position,
      oneTimeOnly: data.oneTimeOnly,
      pulseAnimation: data.pulseAnimation,
    };
  }

  return {
    id: step.id,
    type: 'command',
    raw: `[${step.blockType}]`,
  };
}

export function sceneRecordToSceneDocument(sceneRecord: SceneRecord, characters: Character[] = []): SceneDocument {
  return {
    id: sceneRecord.id,
    title: sceneRecord.name,
    nodes: sceneRecord.timeline.map((step) => timelineStepToSceneNode(step, characters)),
    metadata: {
      createdAt: new Date(sceneRecord.createdAt).toISOString(),
      updatedAt: new Date(sceneRecord.updatedAt).toISOString(),
    },
  };
}

function sceneNodeToTimelineStep(node: SceneNode, characters: Character[]): TimelineStep[] {
  if (node.type === 'narration') {
    if (!node.text.trim()) return [];
    return [createTextStep({ content: node.text })];
  }

  if (node.type === 'dialogue') {
    const character = characters.find((item) => item.name.toLowerCase() === node.characterName.toLowerCase());
    return [createDialogueStep({
      entries: [
        createDialogueEntry({
          characterId: character?.id ?? node.characterName,
          spriteId: character?.defaultSpriteId ?? '',
          text: node.text,
        }),
      ],
      currentEntryIndex: 0,
    })];
  }

  if (node.type === 'background') {
    return [createBackgroundStep({
      assetId: node.assetId || null,
      transition: node.transition === 'cut' ? 'instant' : node.transition === 'slide' ? 'wipe' : 'fade',
      duration: node.durationMs ?? 500,
    })];
  }

  if (node.type === 'character') {
    return [createCharacterStep({
      characterId: node.characterId,
      spriteId: node.spriteId ?? '',
      position: node.position ?? 'center',
      transition: node.transition ?? 'fade',
      delay: node.delay ?? 0,
      duration: node.duration ?? null,
      effect: node.action === 'hide' ? { type: 'hide', duration: 0.5 } : null,
    })];
  }

  if (node.type === 'music') {
    return [createMusicStep({
      assetId: node.assetId || null,
      action: node.action,
      volume: node.volume ?? 0.8,
      loop: node.loop ?? node.action === 'play',
      fadeDuration: node.fadeDuration ?? 1000,
    })];
  }

  if (node.type === 'sound') {
    return [createSoundStep({
      assetId: node.assetId || null,
      action: node.action === 'stop' ? 'stop' : 'play',
      volume: node.volume ?? 0.8,
      loop: node.loop ?? false,
      pitchVariation: node.pitchVariation ?? 0,
    })];
  }

  if (node.type === 'choice') {
    return [createChoiceStep({
      options: node.options.map((option) => ({
        id: option.id || generateId('choice'),
        text: option.label,
        targetSceneId: option.targetSceneId ?? null,
      })),
    })];
  }

  if (node.type === 'transition') {
    return [createTransitionStep({
      targetSceneId: node.targetSceneId ?? null,
      transitionType: node.transitionType ?? 'fade',
      duration: node.duration ?? 1,
    })];
  }

  if (node.type === 'variable') {
    return [createVariableStep({
      variableName: node.variableName,
      operation: node.operation,
      value: node.value,
    })];
  }

  if (node.type === 'effect') {
    return [createEffectStep({
      effectType: node.effectType,
      target: node.target ?? 'screen',
      characterId: node.characterId,
      intensity: node.intensity ?? 50,
      duration: (node.durationMs ?? 500) / 1000,
      rain: node.rain,
      snow: node.snow,
      fog: node.fog,
    })];
  }

  if (node.type === 'camera') {
    return [createCameraStep({
      action: node.action,
      target: node.target,
      zoomLevel: node.zoomLevel,
      panX: node.panX,
      panY: node.panY,
      duration: node.duration ?? 1,
      easing: node.easing ?? 'ease-in-out',
    })];
  }

  if (node.type === 'interactive_object') {
    return [createInteractiveObjectStep({
      objectId: node.objectId || generateId('obj'),
      name: node.name || 'Object',
      assetId: node.assetId ?? null,
      position: node.position ?? { x: 50, y: 50, width: 10, height: 10 },
      oneTimeOnly: node.oneTimeOnly ?? false,
      pulseAnimation: node.pulseAnimation ?? true,
    })];
  }

  if (node.type === 'command') {
    return [createTextStep({ content: node.raw })];
  }

  return [];
}

function sceneDocumentToConnections(document: SceneDocument, nextSceneId?: string): SceneConnection[] {
  const choiceConnections = document.nodes.flatMap((node) => {
    if (node.type !== 'choice') return [];
    return node.options
      .filter((option) => option.targetSceneId)
      .map((option) => ({
        targetSceneId: option.targetSceneId!,
        outputPort: option.id,
        label: option.label,
      }));
  });

  return [
    ...choiceConnections,
    ...(nextSceneId ? [{ targetSceneId: nextSceneId, outputPort: 'next', label: 'Next' }] : []),
  ];
}

export function sceneDocumentToSceneRecord(
  record: SceneRecord,
  document: SceneDocument,
  characters: Character[] = [],
  options: { nextSceneId?: string } = {},
): SceneRecord {
  return {
    ...record,
    name: document.title.trim() || record.name,
    timeline: document.nodes.flatMap((node) => sceneNodeToTimelineStep(node, characters)),
    connections: sceneDocumentToConnections(document, options.nextSceneId),
    updatedAt: Date.now(),
  };
}
