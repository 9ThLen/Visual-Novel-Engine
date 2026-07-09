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
  // Zustand app store
  APP_STATE: `${PREFIX}app_state`,

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
  CANONICAL_SCENE_RECORD_INDEX: `${PREFIX}scene_record_index`,
  CANONICAL_SCENE_RECORDS: (storyId: string) => `${PREFIX}scene_records_${storyId}`,
  CANONICAL_SCENE_RECORD_IDS: (storyId: string) => `${PREFIX}scene_record_ids_${storyId}`,
  CANONICAL_SCENE_RECORD: (storyId: string, sceneId: string) =>
    `${PREFIX}scene_record_${encodeURIComponent(storyId)}_${encodeURIComponent(sceneId)}`,

  // Author-local playtest coverage (per story)
  STORY_COVERAGE: (storyId: string) => `${PREFIX}story_coverage_${encodeURIComponent(storyId)}`,

  // Local version snapshots (per story). The index holds meta only; each
  // snapshot stores a manifest plus one key per scene so bodies never share a
  // single giant blob.
  STORY_SNAPSHOT_INDEX: (storyId: string) =>
    `${PREFIX}story_snapshot_index_${encodeURIComponent(storyId)}`,
  STORY_SNAPSHOT_MANIFEST: (storyId: string, snapshotId: string) =>
    `${PREFIX}story_snapshot_${encodeURIComponent(storyId)}_${encodeURIComponent(snapshotId)}`,
  STORY_SNAPSHOT_SCENE: (storyId: string, snapshotId: string, sceneId: string) =>
    `${PREFIX}story_snapshot_scene_${encodeURIComponent(storyId)}_${encodeURIComponent(
      snapshotId,
    )}_${encodeURIComponent(sceneId)}`,

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
    STORAGE_KEYS.APP_STATE,
    STORAGE_KEYS.STORIES,
    STORAGE_KEYS.BLOCK_TREE,
    STORAGE_KEYS.SAVE_SLOTS,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.CHARACTER_LIBRARY,
  ];

  // Note: Dynamic keys (audio library, scenes) need to be handled separately
  return keys;
}
