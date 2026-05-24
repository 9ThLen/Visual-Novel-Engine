/**
 * Storage Keys - Centralized storage key management
 * 
 * This module provides typed constants for all AsyncStorage keys used in the app.
 * Using these constants prevents typos and makes key management easier.
 */

// Prefix to avoid collisions with other apps
const PREFIX = 'vne_'; // Visual Novel Engine

/**
 * Storage key constants
 */
export const STORAGE_KEYS = {
  // Stories
  STORIES: `${PREFIX}stories`,

  // Audio libraries (per story)
  AUDIO_LIBRARY: (storyId: string) => `${PREFIX}audio_library_${storyId}`,

  // Block tree
  BLOCK_TREE: `${PREFIX}block_tree`,

  // Save slots
  SAVE_SLOTS: `${PREFIX}save_slots`,

  // User settings
  SETTINGS: `${PREFIX}settings`,

  // Character library
  CHARACTER_LIBRARY: `${PREFIX}character_library`,

  // Scene data (per story)
  SCENES: (storyId: string) => `${PREFIX}scenes_${storyId}`,

} as const;

/**
 * Type for storage key names (for type safety)
 */
export type StorageKey = keyof typeof STORAGE_KEYS;

/**
 * Get all storage keys (useful for cleanup)
 */
export function getAllStorageKeys(): string[] {
  const keys: string[] = [
    STORAGE_KEYS.STORIES,
    STORAGE_KEYS.BLOCK_TREE,
    STORAGE_KEYS.SAVE_SLOTS,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.CHARACTER_LIBRARY,
  ];

  // Note: Dynamic keys (audio library, scenes) need to be handled separately
  return keys;
}
