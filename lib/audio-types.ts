/**
 * Extended Audio System Types
 * Support for audio library and trigger-based playback
 */

import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';

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
 * Canonical scene audio data. Audio is carried by TimelineStep music/sound blocks,
 * with optional trigger metadata for the trigger scheduler.
 */
export interface StorySceneAudioTimeline extends Pick<SceneRecord, 'id' | 'storyId' | 'name'> {
  timeline: TimelineStep[];
  audioTriggers?: AudioTrigger[];
}

/**
 * @deprecated Use StorySceneAudioTimeline. Kept for public API compatibility.
 */
export type StorySceneExtended = StorySceneAudioTimeline;

/**
 * Canonical story with audio library and timeline-based scenes.
 */
export interface StoryWithAudio extends Omit<StoryMetadata, 'sceneCount'> {
  sceneCount?: number;
  scenes: Record<string, StorySceneAudioTimeline>;
  audioLibrary?: AudioLibraryItem[];
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
