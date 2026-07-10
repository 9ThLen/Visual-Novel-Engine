import type { FogEffectOptions, RainEffectOptions, SnowEffectOptions } from '@/lib/engine/effect-options';

export type SceneDocument = {
  id: string;
  title: string;
  nodes: SceneNode[];
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
  };
};

export type SceneNode =
  | NarrationNode
  | DialogueNode
  | BackgroundNode
  | CharacterNode
  | MusicNode
  | SoundNode
  | ChoiceNode
  | TransitionNode
  | VariableNode
  | EffectNode
  | StopEffectNode
  | CameraNode
  | InteractiveObjectNode
  | LabelNode
  | GotoNode
  | CommandNode;

export type NarrationNode = {
  id: string;
  type: 'narration';
  text: string;
};

export type DialogueNode = {
  id: string;
  type: 'dialogue';
  characterName: string;
  text: string;
  color?: string;
};

export type BackgroundNode = {
  id: string;
  type: 'background';
  assetId: string;
  transition?: 'cut' | 'fade' | 'slide';
  durationMs?: number;
};

export type CharacterNode = {
  id: string;
  type: 'character';
  characterId: string;
  spriteId?: string;
  action: 'show' | 'hide';
  position?: 'left' | 'center' | 'right' | 'far-left' | 'far-right';
  transition?: 'instant' | 'fade' | 'slide-left' | 'slide-right' | 'zoom';
  delay?: number;
  duration?: number | null;
};

export type MusicNode = {
  id: string;
  type: 'music';
  mode: 'track' | 'silence';
  assetId?: string;
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  boundTo?: 'scene' | 'continuous';
  autoFadeAfter?: number;
};

export type SoundNode = {
  id: string;
  type: 'sound';
  mode: 'track' | 'silence';
  assetId?: string;
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  pitchVariation?: number;
  boundTo?: 'scene' | 'continuous';
};

export type ChoiceNode = {
  id: string;
  type: 'choice';
  prompt?: string;
  options: {
    id: string;
    label: string;
    targetSceneId?: string;
  }[];
};

export type CommandNode = {
  id: string;
  type: 'command';
  raw: string;
};

export type TransitionNode = {
  id: string;
  type: 'transition';
  /** 'next' = follow next connection, 'scene' = jump to targetSceneId, 'end' = end the story. */
  mode?: 'next' | 'scene' | 'end';
  targetSceneId: string | null;
  transitionType?: 'fade' | 'slide' | 'instant' | 'dissolve' | 'slide-left' | 'slide-right' | 'slide-up' | 'wipe';
  duration?: number;
};

export type LabelNode = {
  id: string;
  type: 'label';
  name: string;
};

export type GotoNode = {
  id: string;
  type: 'goto';
  targetLabel: string;
  condition?: {
    variableName: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'isEmpty' | 'has' | 'not_has';
    value: string | number | boolean;
  } | null;
  elseTargetLabel?: string | null;
};

export type VariableNode = {
  id: string;
  type: 'variable';
  variableName: string;
  operation: 'set' | 'add' | 'subtract' | 'multiply' | 'toggle';
  value: string | number | boolean;
};

export type EffectNode = {
  id: string;
  type: 'effect';
  effectType: 'shake' | 'flash' | 'blur' | 'rain' | 'snow' | 'fog' | 'glitch' | 'vignette';
  target?: 'screen' | 'character' | 'background';
  characterId?: string;
  intensity?: number;
  durationMs?: number;
  durationMode?: 'scene' | 'timed';
  rain?: RainEffectOptions;
  snow?: SnowEffectOptions;
  fog?: FogEffectOptions;
};

export type StopEffectNode = {
  id: string;
  type: 'stop_effect';
  effectType: 'shake' | 'flash' | 'blur' | 'rain' | 'snow' | 'fog' | 'glitch' | 'vignette' | 'all';
  target?: 'screen' | 'character' | 'background' | 'all';
};

export type CameraNode = {
  id: string;
  type: 'camera';
  action: 'zoom' | 'pan' | 'focus' | 'reset';
  target?: string;
  zoomLevel?: number;
  panX?: number;
  panY?: number;
  duration?: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
};

export type InteractiveObjectNode = {
  id: string;
  type: 'interactive_object';
  objectId: string;
  name: string;
  assetId?: string | null;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  oneTimeOnly?: boolean;
  pulseAnimation?: boolean;
};
