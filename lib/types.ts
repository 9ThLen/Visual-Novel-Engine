/**
 * Core data structures for the Visual Novel Engine
 */

import type { SplashScreenConfig } from './splash-types';
import type { InteractiveObject } from './interactive-types';
import type { AudioLibraryItem, AudioTrigger } from './audio-types';
import type { CharacterSprite } from './character-types';

/** @see assets/demo-story-advanced.json for example values */
/**
 * Represents a single choice option in a scene
 */
export interface Choice {
  id: string;
  text: string;
  nextSceneId: string;
}

/**
 * Legacy compatibility-only scene shape.
 *
 * Deprecated for new editor/runtime work. New scene logic should use
 * `SceneRecord + TimelineStep` and convert through the centralized adapter
 * only when a compatibility representation is still required.
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
  autoAdvance?: {
    enabled: boolean;
    delay: number;
    nextSceneId: string;
  };
  // Block-based content for the scene (can contain text, images, audio, etc.)
  // Note: Block system removed, kept as unknown[] for backward compatibility
  blocks?: unknown[];
  // Audio triggers for enhanced audio system
  audioTriggers?: AudioTrigger[];
}

/**
 * Legacy compatibility-only story structure.
 *
 * Deprecated for new persistence work. Keep for reader compatibility until the
 * canonical scene model migration is complete.
 */
export interface Story {
  id: string;
  title: string;
  description?: string;
  author?: string;
  startSceneId: string;
  scenes: Record<string, StoryScene>;
  audioLibrary?: AudioLibraryItem[]; // Per-story audio library
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
  choicesMade: { sceneId: string; choiceId: string }[];
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
}

/**
 * Represents the current playback state
 */
export interface PlaybackState {
  storyId: string;
  currentSceneId: string;
  isPlaying: boolean;
  currentDialogueIndex: number; // Reserved for future feature: step-by-step dialogue display
  choicesMade: { sceneId: string; choiceId: string }[];
}

