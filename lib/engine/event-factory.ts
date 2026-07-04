/**
 * lib/engine/event-factory.ts — Factory functions for creating timeline steps
 *
 * Each factory creates a TimelineStep with sensible defaults.
 * Used by BlockLibrary when user adds a new block.
 */

import { generateId } from '@/lib/id-utils';
import { getDefaultEffectDuration, normalizeEffectDurationMode } from './effect-duration';
import type {
  TimelineStep,
  BlockType,
  BackgroundBlockData,
  CharacterBlockData,
  TextBlockData,
  DialogueBlockData,
  DialogueEntry,
  ChoiceBlockData,
  ChoiceOption,
  EffectBlockData,
  MusicBlockData,
  SoundBlockData,
  InteractiveObjectBlockData,
  CameraBlockData,
  VariableBlockData,
  TransitionBlockData,
  BlockData,
} from './types';

// ── Factory Helper ────────────────────────────────────────────────────────

function createStep<T extends BlockData>(blockType: BlockType, data: T): TimelineStep {
  return {
    id: generateId('step'),
    blockType,
    data,
    collapsed: false,
    enabled: true,
  };
}

// ── Individual Block Factories ─────────────────────────────────────────────

export function createBackgroundStep(overrides?: Partial<BackgroundBlockData>): TimelineStep {
  return createStep('background', {
    assetId: null,
    transition: 'fade',
    duration: 500,
    ...overrides,
  });
}

export function createCharacterStep(overrides?: Partial<CharacterBlockData>): TimelineStep {
  return createStep('character', {
    action: 'show',
    characterId: '',
    spriteId: '',
    position: 'center',
    transition: 'fade',
    delay: 0,
    duration: null,
    effect: null,
    ...overrides,
  });
}

export function createTextStep(overrides?: Partial<TextBlockData>): TimelineStep {
  return createStep('text', {
    content: '',
    typewriterSpeed: 0.5,
    anchorTo: 'background',
    ...overrides,
  });
}

export function createDialogueEntry(overrides?: Partial<DialogueEntry>): DialogueEntry {
  return {
    id: generateId('dialogue_entry'),
    characterId: '',
    spriteId: '',
    text: '',
    ...overrides,
  };
}

export function createDialogueStep(overrides?: Partial<DialogueBlockData>): TimelineStep {
  return createStep('dialogue', {
    entries: [createDialogueEntry()],
    currentEntryIndex: 0,
    ...overrides,
  });
}

export function createChoiceOption(overrides?: Partial<ChoiceOption>): ChoiceOption {
  return {
    id: generateId('choice'),
    text: '',
    targetSceneId: null,
    ...overrides,
  };
}

export function createChoiceStep(overrides?: Partial<ChoiceBlockData>): TimelineStep {
  return createStep('choice', {
    options: [
      createChoiceOption({ text: 'Choice 1' }),
      createChoiceOption({ text: 'Choice 2' }),
    ],
    ...overrides,
  });
}

export function createEffectStep(overrides?: Partial<EffectBlockData>): TimelineStep {
  const effectType = overrides?.effectType ?? 'shake';

  return createStep('effect', {
    effectType,
    target: 'screen',
    intensity: 50,
    duration: getDefaultEffectDuration(effectType),
    ...overrides,
    durationMode: normalizeEffectDurationMode(effectType, overrides?.durationMode, overrides?.duration),
  });
}

export function createMusicStep(overrides?: Partial<MusicBlockData>): TimelineStep {
  return createStep('music', {
    mode: 'track',
    assetId: null,
    volume: 0.8,
    loop: true,
    fadeIn: 1,
    fadeOut: 0.8,
    boundTo: 'continuous',
    ...overrides,
  });
}

export function createSoundStep(overrides?: Partial<SoundBlockData>): TimelineStep {
  return createStep('sound', {
    mode: 'track',
    assetId: null,
    volume: 0.8,
    loop: false,
    fadeIn: 0,
    fadeOut: 0.8,
    pitchVariation: 0,
    boundTo: 'continuous',
    ...overrides,
  });
}

export function createInteractiveObjectStep(overrides?: Partial<InteractiveObjectBlockData>): TimelineStep {
  return createStep('interactive_object', {
    objectId: generateId('obj'),
    name: 'New Object',
    assetId: null,
    position: { x: 50, y: 50, width: 10, height: 10 },
    actions: [],
    oneTimeOnly: false,
    pulseAnimation: true,
    ...overrides,
  });
}

export function createCameraStep(overrides?: Partial<CameraBlockData>): TimelineStep {
  return createStep('camera', {
    action: 'zoom',
    zoomLevel: 1.5,
    duration: 1.0,
    easing: 'ease-in-out',
    ...overrides,
  });
}

export function createVariableStep(overrides?: Partial<VariableBlockData>): TimelineStep {
  return createStep('variable', {
    variableName: '',
    operation: 'set',
    value: 0,
    ...overrides,
  });
}

export function createTransitionStep(overrides?: Partial<TransitionBlockData>): TimelineStep {
  return createStep('transition', {
    targetSceneId: null,
    transitionType: 'fade',
    duration: 1.0,
    ...overrides,
  });
}

// ── Block Factory Map ─────────────────────────────────────────────────────

type BlockFactory = () => TimelineStep;

const BLOCK_FACTORY_MAP: Record<BlockType, BlockFactory> = {
  background:         () => createBackgroundStep(),
  character:          () => createCharacterStep(),
  text:               () => createTextStep(),
  dialogue:           () => createDialogueStep(),
  choice:             () => createChoiceStep(),
  effect:             () => createEffectStep(),
  music:              () => createMusicStep(),
  sound:              () => createSoundStep(),
  interactive_object: () => createInteractiveObjectStep(),
  camera:             () => createCameraStep(),
  variable:           () => createVariableStep(),
  transition:         () => createTransitionStep(),
};

export function createBlockStep(blockType: BlockType): TimelineStep {
  const factory = BLOCK_FACTORY_MAP[blockType];
  if (!factory) {
    throw new Error(`Unknown block type: ${blockType}`);
  }
  return factory();
}

// ── Duplicate ──────────────────────────────────────────────────────────────

export function duplicateStep(step: TimelineStep): TimelineStep {
  return {
    ...step,
    id: generateId('step'),
    // Deep clone data to avoid shared references
    data: JSON.parse(JSON.stringify(step.data)),
  };
}
