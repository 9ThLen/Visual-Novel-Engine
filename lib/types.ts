/**
 * Core data structures for the Visual Novel Engine
 */

import type { SplashScreenConfig } from './splash-types';
import type { InteractiveObject } from './interactive-types';

/**
 * Represents a single choice option in a scene
 */
export interface Choice {
  id: string;
  text: string;
  nextSceneId: string;
}

/**
 * Represents a character sprite with optional positioning
 */
export interface CharacterSprite {
  id: string;
  imageUri: string;
  name: string;
  position?: 'left' | 'center' | 'right';
  scale?: number;
}

/**
 * Represents a single scene/node in the story
 */
export interface StoryScene {
  id: string;
  text: string;
  backgroundImageUri?: string | null;
  characters: CharacterSprite[];
  voiceAudioUri?: string | null;
  choices: Choice[];
  musicUri?: string | null;
  splashScreen?: SplashScreenConfig;
  interactiveObjects?: InteractiveObject[];
}

/**
 * Represents the complete story structure
 */
export interface Story {
  id: string;
  title: string;
  description?: string;
  author?: string;
  startSceneId: string;
  scenes: Record<string, StoryScene>;
  createdAt: number;
  updatedAt: number;
  thumbnailUri?: string;
}

/**
 * Represents a save game state
 */
export interface SaveSlot {
  id: string;
  storyId: string;
  sceneId: string;
  choicesMade: Array<{ sceneId: string; choiceId: string }>;
  timestamp: number;
  sceneName?: string;
  thumbnailUri?: string;
  storyTitle?: string;
  sceneText?: string; // First line of dialogue for preview
  playTime?: number; // Total play time in milliseconds
}

/**
 * Represents user settings/preferences
 */
export interface UserSettings {
  bgmVolume: number; // 0-1
  voiceVolume: number; // 0-1
  sfxVolume: number; // 0-1
  textSpeed: number; // 0-1 (slow to fast)
  textSize: 'small' | 'medium' | 'large';
  autoPlay: boolean;
  darkMode: boolean;
}

/**
 * Represents the current playback state
 */
export interface PlaybackState {
  storyId: string;
  currentSceneId: string;
  isPlaying: boolean;
  currentDialogueIndex: number;
  choicesMade: Array<{ sceneId: string; choiceId: string }>;
}

/**
 * Represents an asset (image or audio file)
 */
export interface Asset {
  id: string;
  type: 'image' | 'audio';
  uri: string;
  name: string;
  size: number;
  createdAt: number;
}

/**
 * Represents the app state
 */
export interface AppState {
  stories: Story[];
  currentStory: Story | null;
  playbackState: PlaybackState | null;
  saveSlots: SaveSlot[];
  settings: UserSettings;
  assets: Asset[];
}
