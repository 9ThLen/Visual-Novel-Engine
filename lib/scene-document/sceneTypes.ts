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
  | CameraNode
  | InteractiveObjectNode
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
  action: 'play' | 'stop' | 'pause' | 'fade';
  assetId?: string;
  volume?: number;
  loop?: boolean;
  fadeDuration?: number;
};

export type SoundNode = {
  id: string;
  type: 'sound';
  action: 'play' | 'stop';
  assetId?: string;
  volume?: number;
  loop?: boolean;
  pitchVariation?: number;
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
  targetSceneId: string | null;
  transitionType?: 'fade' | 'dissolve' | 'slide-left' | 'slide-right' | 'slide-up' | 'wipe';
  duration?: number;
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
  effectType: 'shake' | 'flash' | 'blur' | 'rain' | 'snow' | 'glitch' | 'vignette';
  target?: 'screen' | 'character' | 'background';
  characterId?: string;
  intensity?: number;
  durationMs?: number;
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
