/**
 * lib/engine/types.ts — Core types for the new VNE Editor
 *
 * Architecture: UI Block → TimelineStep (Event[]) → Runtime
 *
 * This replaces the old Atom/Molecule/Lego system completely.
 * All new editor code uses these types.
 */

import type { Language } from '@/lib/translations';
import type { Character } from '@/lib/character-types';
import type { AudioTrigger } from '@/lib/audio-types';
import type { InteractiveAction, InteractiveObjectPosition } from '@/lib/interactive-types';
import type { FogEffectOptions, RainEffectOptions, SnowEffectOptions } from './effect-options';
import type { SceneState } from './runtime-types';

export type {
  ActiveEffect,
  CameraRuntimeState,
  CharacterRuntimeState,
  DialogueHistoryEntry,
  PlaybackState,
  SceneState,
  SoundRuntimeEvent,
} from './runtime-types';

// ── Block Categories ────────────────────────────────────────────────────

export type BlockCategory = 'scene' | 'dialogue' | 'media' | 'effects' | 'logic';

export const BLOCK_CATEGORIES: { key: BlockCategory; label: string; icon: string }[] = [
  { key: 'scene', label: 'Scene', icon: 'movie' },
  { key: 'dialogue', label: 'Dialogue', icon: 'voice' },
  { key: 'media', label: 'Media', icon: 'music' },
  { key: 'effects', label: 'Effects', icon: 'lightning' },
  { key: 'logic', label: 'Logic', icon: 'settings' },
];

export const BLOCK_CATEGORY_MAP: Record<BlockType, BlockCategory> = {
  background: 'scene',
  character: 'scene',
  interactive_object: 'scene',
  text: 'dialogue',
  dialogue: 'dialogue',
  choice: 'dialogue',
  music: 'media',
  sound: 'media',
  effect: 'effects',
  camera: 'effects',
  transition: 'effects',
  variable: 'logic',
};

// ── Block Types (UI-level) ──────────────────────────────────────────────

export type BlockType =
  | 'background'
  | 'character'
  | 'text'
  | 'dialogue'
  | 'choice'
  | 'effect'
  | 'music'
  | 'sound'
  | 'interactive_object'
  | 'camera'
  | 'variable'
  | 'transition';

export interface BlockTypeInfo {
  type: BlockType;
  label: string;
  description: string;
  icon: string;
  color: string;       // hex color for left border / accent
  bgColor: string;     // semi-transparent bg (color + '15'/'20')
  comingSoon?: boolean;
  disabled?: boolean;
}

export const BLOCK_TYPE_INFO: Record<BlockType, BlockTypeInfo> = {
  background:        { type: 'background',        label: 'Background',        description: 'Change scene background',     icon: 'image', color: '#50c878', bgColor: '#50c87820' },
  character:         { type: 'character',         label: 'Character',         description: 'Show/hide character sprite',  icon: 'character', color: '#f5a623', bgColor: '#f5a62320' },
  text:              { type: 'text',              label: 'Text / Narration',   description: 'Display narration text',       icon: 'text', color: '#7c5bf5', bgColor: '#7c5bf520' },
  dialogue:          { type: 'dialogue',          label: 'Dialogue',          description: 'Runtime character dialogue; author via Character lines',  icon: 'voice', color: '#9b59b6', bgColor: '#9b59b620', disabled: true },
  choice:            { type: 'choice',            label: 'Choice',            description: 'Player choice branch',         icon: 'timeline', color: '#e91e63', bgColor: '#e91e6320' },
  effect:            { type: 'effect',            label: 'Effect',            description: 'Visual/screen effects',        icon: 'lightning', color: '#ffd93d', bgColor: '#ffd93d20' },
  music:             { type: 'music',             label: 'Music',             description: 'Play/stop background music',   icon: 'music', color: '#ff6b6b', bgColor: '#ff6b6b20' },
  sound:             { type: 'sound',             label: 'Sound',             description: 'Play sound effect',            icon: 'sound', color: '#ef5350', bgColor: '#ef535020' },
  interactive_object:{ type: 'interactive_object',label: 'Interactive Object', description: 'Clickable scene object',       icon: 'location', color: '#00bcd4', bgColor: '#00bcd420' },
  camera:            { type: 'camera',            label: 'Camera',            description: 'Camera zoom/pan/focus',        icon: 'camera', color: '#009688', bgColor: '#00968820' },
  variable:          { type: 'variable',          label: 'Variable',          description: 'Set/modify a variable',         icon: 'settings', color: '#8bc34a', bgColor: '#8bc34a20' },
  transition:        { type: 'transition',        label: 'Transition',        description: 'Scene transition effect',       icon: 'timeline', color: '#3f51b5', bgColor: '#3f51b520' },
};

// ── Timeline Step ────────────────────────────────────────────────────────
// Canonical event step used by the editor, scene persistence and future runtime.

export interface TimelineStep {
  id: string;
  blockType: BlockType;
  data: BlockData;
  collapsed: boolean;       // UI state: is block collapsed?
  enabled: boolean;         // Is this step active?
  conditions?: Condition[]; // Conditional execution
}

// Explicit aliases make the canonical contract visible at import sites.
export type CanonicalTimelineStep = TimelineStep;

// ── Block Data (union of all block payloads) ─────────────────────────────

export type BlockData =
  | BackgroundBlockData
  | CharacterBlockData
  | TextBlockData
  | DialogueBlockData
  | ChoiceBlockData
  | EffectBlockData
  | MusicBlockData
  | SoundBlockData
  | InteractiveObjectBlockData
  | CameraBlockData
  | VariableBlockData
  | TransitionBlockData;

export interface BackgroundBlockData {
  assetId: string | null;
  transition: 'fade' | 'dissolve' | 'instant' | 'wipe';
  duration: number;         // ms, default 500
  delay?: number;           // seconds before transition starts
  fit?: 'cover' | 'contain' | 'stretch';
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

export interface CharacterBlockData {
  action?: 'show' | 'hide' | 'change_sprite' | 'move';
  generatedByInlineDialogue?: boolean;
  characterId: string;
  spriteId: string;
  position: 'left' | 'center' | 'right' | 'far-left' | 'far-right';
  transition: 'instant' | 'fade' | 'slide-left' | 'slide-right' | 'zoom';
  delay: number;            // seconds before appearance
  duration: number | null;  // null = permanent, otherwise seconds until disappear
  effect?: CharacterEffectData | null;
}

export interface CharacterEffectData {
  type: 'move' | 'shake' | 'hide' | 'show' | 'scale';
  fromPosition?: 'left' | 'center' | 'right' | 'far-left' | 'far-right';
  toPosition?: 'left' | 'center' | 'right' | 'far-left' | 'far-right';
  intensity?: number;       // 0-100
  duration: number;         // seconds
  direction?: 'left' | 'right' | 'up' | 'down';
  targetScale?: number;     // 0.1-3.0
}

export interface TextBlockData {
  content: string;
  typewriterSpeed: number;  // 0-1 (slow to fast)
  anchorTo: 'background' | 'character';
  characterId?: string;     // if anchorTo = 'character'
  spriteId?: string;
}

export interface DialogueEntry {
  id: string;
  characterId: string;
  speakerName?: string;
  spriteId: string;
  text: string;
}

export interface DialogueBlockData {
  entries: DialogueEntry[];
  currentEntryIndex: number; // Runtime state: which entry is being displayed
  speakerFocus?: {
    characterId: string;
    enabled: boolean;
    scale?: number;
    dimOthers?: boolean;
  };
}

export interface ChoiceOption {
  id: string;
  text: string;
  targetSceneId: string | null;  // null = end scene
  condition?: Condition;
}

export interface ChoiceBlockData {
  options: ChoiceOption[];
}

export type EffectType = 'shake' | 'flash' | 'blur' | 'rain' | 'snow' | 'fog' | 'glitch' | 'vignette';
export type EffectDurationMode = 'scene' | 'timed';

export interface EffectBlockData {
  effectType: EffectType;
  target: 'screen' | 'character' | 'background';
  characterId?: string;     // if target = 'character'
  intensity: number;        // 0-100
  duration: number;         // seconds
  durationMode?: EffectDurationMode;
  fadeIn?: number;          // seconds
  fadeOut?: number;         // seconds
  rain?: RainEffectOptions;
  snow?: SnowEffectOptions;
  fog?: FogEffectOptions;
}

export interface MusicBlockData {
  assetId: string | null;
  action: 'play' | 'stop' | 'pause' | 'fade';
  volume: number;           // 0-1
  loop: boolean;
  fadeDuration: number;     // ms
}

export interface SoundBlockData {
  assetId: string | null;
  action: 'play' | 'stop';
  volume: number;
  loop: boolean;
  pitchVariation: number;   // 0-1 random pitch variation
}

export interface InteractiveObjectBlockData {
  objectId: string;
  name: string;
  assetId: string | null;
  position: InteractiveObjectPosition;
  actions: InteractiveAction[];
  oneTimeOnly: boolean;
  pulseAnimation: boolean;
}

export interface CameraBlockData {
  action: 'zoom' | 'pan' | 'focus' | 'reset';
  target?: string;          // characterId for focus
  zoomLevel?: number;       // 0.5-3.0
  panX?: number;            // percentage
  panY?: number;            // percentage
  duration: number;         // seconds
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface VariableBlockData {
  variableName: string;
  operation: 'set' | 'add' | 'subtract' | 'multiply' | 'toggle';
  value: string | number | boolean;
}

export interface TransitionBlockData {
  targetSceneId: string | null;  // null = end of story
  transitionType: 'fade' | 'dissolve' | 'slide-left' | 'slide-right' | 'slide-up' | 'wipe';
  duration: number;         // seconds
}

// ── Conditions ────────────────────────────────────────────────────────────

export type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'isEmpty' | 'has' | 'not_has';

export interface Condition {
  variableName: string;
  operator: ConditionOperator;
  value: string | number | boolean;
}

// ── Scene State (runtime) ────────────────────────────────────────────────

// ── Project ──────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  title: string;
  description: string;
  author: string;
  language: Language;
  tags: string[];
  thumbnailUri: string | null;
  scenes: ProjectScene[];
  characters: Character[];
  variables: ProjectVariable[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectScene {
  id: string;
  name: string;
  timeline: TimelineStep[];
  sceneState: SceneState;
  // Story flow positioning
  flowX: number;
  flowY: number;
}

// ── Scene Record (persisted scene with metadata & connections) ─────────────
// This is the canonical persisted scene contract for the refactor cycle.
// Reader/audio/runtime code should consume explicit projections instead of this storage shape.

export interface SceneConnection {
  targetSceneId: string;
  outputPort: string;   // 'next' | 'choice_a' | 'choice_b' | 'true' | 'false' | ...
  label?: string;       // optional label on the connection line
}

export interface SceneRecord extends ProjectScene {
  storyId: string;
  description: string;
  tags: string[];
  voiceAudioUri?: string | null;
  audioTriggers?: AudioTrigger[];
  autoAdvance?: {
    enabled: boolean;
    delay: number;
    nextSceneId: string;
  };
  connections: SceneConnection[];
  isStart: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CanonicalSceneRecord = SceneRecord;

export interface ProjectVariable {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue: string | number | boolean;
  category: string;
}
