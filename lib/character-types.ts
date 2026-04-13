/**
 * Character System Types
 * Types for character library and animations
 */

// ── Character Library ─────────────────────────────────────────────────────

export interface CharacterSprite {
  id: string;
  name: string; // e.g., "Happy", "Sad", "Angry", "Casual Outfit"
  uri: string;
  tags?: string[]; // e.g., ["emotion", "happy"], ["outfit", "casual"]
  createdAt: number;
}

export interface Character {
  id: string;
  name: string; // Character name, e.g., "Alice"
  sprites: CharacterSprite[];
  defaultSpriteId?: string;
  createdAt: number;
}

export interface CharacterLibrary {
  characters: Character[];
}

// ── Character Animation ───────────────────────────────────────────────────

export type CharacterPosition = 'left' | 'center' | 'right' | 'far-left' | 'far-right';

export type CharacterTransition =
  | 'instant' // Instant appearance
  | 'fade' // Fade in/out
  | 'slide' // Slide from side
  | 'zoom' // Zoom in with slight scale
  | 'shake'; // Shake screen effect

export interface CharacterAnimation {
  transition: CharacterTransition;
  duration?: number; // milliseconds, default 300
  delay?: number; // milliseconds before animation starts
}

// ── Character Instance ────────────────────────────────────────────────────

export interface CharacterInstance {
  id: string; // Unique instance ID
  characterId: string; // Reference to Character in library
  spriteId: string; // Current sprite
  position: CharacterPosition;
  scale?: number; // Default 1.0
  opacity?: number; // Default 1.0
  zIndex?: number; // Layer order
}

// ── Scene Character Actions ───────────────────────────────────────────────

export type CharacterActionType =
  | 'show' // Show character
  | 'hide' // Hide character
  | 'move' // Move to different position
  | 'change_sprite' // Change sprite (pose/emotion)
  | 'animate'; // Apply animation effect

export interface CharacterAction {
  id: string;
  type: CharacterActionType;
  characterId: string; // Reference to Character in library
  instanceId?: string; // For hide/move/change_sprite actions
  spriteId?: string; // For show/change_sprite
  position?: CharacterPosition; // For show/move
  animation?: CharacterAnimation;
  scale?: number;
  opacity?: number;
  zIndex?: number;
}

// ── Extended Scene ────────────────────────────────────────────────────────

export interface StorySceneWithCharacters {
  id: string;
  text: string;
  characterActions: CharacterAction[]; // Actions to execute when scene starts
  activeCharacters?: CharacterInstance[]; // Characters visible in this scene
  // ... other scene properties
}

// ── Character Playback State ──────────────────────────────────────────────

export interface CharacterPlaybackState {
  sceneId: string;
  instances: CharacterInstance[];
}
