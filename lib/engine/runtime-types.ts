import type { InteractiveObject } from '@/lib/interactive-types';
import type { FogEffectOptions, RainEffectOptions, SnowEffectOptions } from './effect-options';

export type RuntimeConditionOperator =
  | '=='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'contains'
  | 'isEmpty'
  | 'has'
  | 'not_has';

export interface RuntimeCondition {
  variableName: string;
  operator: RuntimeConditionOperator;
  value: string | number | boolean;
}

export interface RuntimeChoiceOption {
  id: string;
  text: string;
  targetSceneId: string | null;
  condition?: RuntimeCondition;
}

export type RuntimeEffectType = 'shake' | 'flash' | 'blur' | 'rain' | 'snow' | 'glitch' | 'vignette';
export type RuntimeMusicAction = 'play' | 'stop' | 'pause' | 'fade';
export type RuntimeSoundAction = 'play' | 'stop';
export type RuntimeCameraAction = 'zoom' | 'pan' | 'focus' | 'reset';
export type RuntimeCameraEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface SceneState {
  backgroundAssetId: string | null;
  backgroundTransition: string;
  characters: CharacterRuntimeState[];
  activeEffects: ActiveEffect[];
  soundEvents?: SoundRuntimeEvent[];
  cameraState?: CameraRuntimeState;
  interactiveObjects?: InteractiveObject[];
  musicTrackId: string | null;
  musicPlaying: boolean;
  musicAction?: RuntimeMusicAction | null;
  musicVolume: number;
  musicLoop?: boolean;
  musicFadeDuration?: number;
  variables: Record<string, string | number | boolean>;
  dialogueHistory: DialogueHistoryEntry[];
  currentChoices: RuntimeChoiceOption[] | null;
  isTransitioning: boolean;
  transitionTarget: string | null;
  currentStepIndex?: number;
  activeSpeakerCharacterId?: string | null;
  activeSpeakerFocusScale?: number;
  dimNonSpeakerCharacters?: boolean;
}

export interface CharacterRuntimeState {
  characterId: string;
  spriteId: string;
  position: string;
  visible: boolean;
  opacity: number;
  scale: number;
  zIndex: number;
}

export interface ActiveEffect {
  effectType: RuntimeEffectType;
  target: string;
  characterId?: string;
  intensity: number;
  fadeIn?: number;
  fadeOut?: number;
  rain?: RainEffectOptions;
  snow?: SnowEffectOptions;
  fog?: FogEffectOptions;
  startTime: number;
  endTime: number;
}

export interface SoundRuntimeEvent {
  id: string;
  assetId: string;
  action: RuntimeSoundAction;
  volume: number;
  loop: boolean;
  pitchVariation: number;
  timestamp: number;
}

export interface CameraRuntimeState {
  action: RuntimeCameraAction;
  zoomLevel: number;
  panX: number;
  panY: number;
  target?: string;
  duration: number;
  easing: RuntimeCameraEasing;
}

export interface DialogueHistoryEntry {
  characterId: string;
  characterName: string;
  text: string;
  timestamp: number;
}

export interface PlaybackState {
  storyId: string;
  currentSceneId: string;
  isPlaying: boolean;
  currentDialogueIndex: number;
  choicesMade: { sceneId: string; choiceId: string }[];
}
