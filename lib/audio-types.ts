/**
 * Extended Audio System Types
 * Support for audio library and trigger-based playback
 */

import type { StoryScene, Choice, CharacterSprite } from './types';

/**
 * Audio trigger types
 */
export type AudioTriggerType =
  | 'scene_start'      // Play when scene starts
  | 'text_complete'    // Play after text finishes typing
  | 'delay'            // Play after X milliseconds
  | 'choice_shown'     // Play when choices appear
  | 'manual';          // Triggered manually by script

/**
 * Audio library item
 */
export interface AudioLibraryItem {
  id: string;
  name: string;
  uri: string;
  type: 'music' | 'sfx' | 'voice' | 'ambient';
  duration?: number; // in seconds
  loop?: boolean;
  volume?: number; // 0-1
  tags?: string[]; // e.g., ['thunder', 'rain', 'nature']
  createdAt: number;
}

/**
 * Audio trigger configuration
 */
export interface AudioTrigger {
  id: string;
  audioId: string; // Reference to AudioLibraryItem
  triggerType: AudioTriggerType;
  delay?: number; // For 'delay' type, in milliseconds
  volume?: number; // Override library item volume
  loop?: boolean; // Override library item loop
  fadeIn?: number; // Fade in duration in ms
  fadeOut?: number; // Fade out duration in ms
  stopPrevious?: boolean; // Stop previous audio of same type
}

/**
 * Extended Story Scene with audio triggers
 */
export interface StorySceneExtended extends Omit<StoryScene, 'musicUri' | 'voiceAudioUri'> {
  // Audio triggers replace simple URIs
  audioTriggers: AudioTrigger[];

  // Legacy support (will be migrated to triggers)
  musicUri?: string | null;
  voiceAudioUri?: string | null;
}

/**
 * Story with audio library
 */
export interface StoryWithAudio {
  id: string;
  title: string;
  description?: string;
  author?: string;
  startSceneId: string;
  scenes: Record<string, StorySceneExtended>;
  audioLibrary: AudioLibraryItem[]; // Per-story audio library
  createdAt: number;
  updatedAt: number;
  thumbnailUri?: string;
}

/**
 * Audio playback state
 */
export interface AudioPlaybackState {
  trackId: string; // 'bgm', 'sfx_1', 'ambient_1', etc.
  audioId: string; // Reference to library item
  isPlaying: boolean;
  volume: number;
  loop: boolean;
  startTime: number;
  triggerId?: string;
}

/**
 * Audio manager state
 */
export interface AudioManagerState {
  activeTracks: Map<string, AudioPlaybackState>;
  library: Map<string, AudioLibraryItem>;
  masterVolume: number;
}
