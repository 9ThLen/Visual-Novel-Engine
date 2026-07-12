import type { PlaybackState, RuntimeVariables } from './engine/runtime-types';
import type { SceneRecord } from './engine/types';
import type { Character } from './character-types';
import { sanitizeStoryTheme, type StoryReaderTheme } from './story-theme';

export interface StoryMetadata {
  id: string;
  title: string;
  description?: string;
  author?: string;
  startSceneId: string;
  createdAt: number;
  updatedAt: number;
  thumbnailUri?: string;
  tags?: string[];
  sceneCount: number;
  sceneOrder?: string[];
  characterAuthoringSchemaVersion?: number;
  theme?: StoryReaderTheme;
}

/**
 * The single normalization funnel for story metadata. Runs at every data-entry
 * boundary (import, bundled/player-mode seeding, persist hydration) so a broken
 * value from any source is cleaned before it reaches the store. Idempotent — safe
 * to run on already-normalized metadata — and the place to add future per-field
 * normalization so every boundary picks it up automatically.
 */
export function normalizeStoryMetadata(metadata: StoryMetadata): StoryMetadata {
  const theme = sanitizeStoryTheme(metadata.theme);
  const normalized: StoryMetadata = { ...metadata };
  if (theme) {
    normalized.theme = theme;
  } else {
    delete normalized.theme;
  }
  return normalized;
}

export interface StoryMetadataInput extends Omit<StoryMetadata, 'sceneCount'> {
  sceneCount?: number;
  scenes?: Record<string, unknown>;
  audioLibrary?: unknown;
}

export interface CanonicalStory extends Omit<StoryMetadata, 'sceneCount'> {
  sceneCount?: number;
  scenes: Record<string, SceneRecord>;
  characterLibrary?: Character[];
  characterAuthoringSchemaVersion?: number;
}

export interface SaveSlotStoryInput {
  id: string;
  title: string;
}

export interface SaveSlotScenePreviewInput {
  id: string;
  text?: string;
  backgroundImageUri?: string | null;
}

/**
 * Represents a save game state.
 */
export interface SaveSlot {
  id: string;
  storyId: string;
  sceneId: string;
  choicesMade: { sceneId: string; choiceId: string }[];
  variables?: RuntimeVariables;
  timestamp: number;
  sceneName?: string;
  thumbnailUri?: string;
  storyTitle?: string;
  sceneText?: string;
  playTime?: number;
}

export const StoryDomain = {
  extractMetadata(story: StoryMetadataInput): StoryMetadata {
    const { scenes, audioLibrary, ...metadata } = story;
    return {
      ...metadata,
      sceneCount: metadata.sceneCount ?? Object.keys(scenes || {}).length
    };
  },

  createSaveSlot(
    slotId: string,
    story: SaveSlotStoryInput,
    playbackState: PlaybackState,
    currentScene?: SaveSlotScenePreviewInput
  ): SaveSlot {
    // Extract first line of dialogue for preview - safe access
    const sceneText = currentScene?.text?.split('\n')[0]?.slice(0, 100) || '';

    const sceneTitle = currentScene?.id;
    return {
      id: slotId,
      storyId: story.id,
      sceneId: playbackState.currentSceneId,
      choicesMade: playbackState.choicesMade,
      variables: playbackState.variables,
      timestamp: Date.now(),
      sceneName: sceneTitle,
      thumbnailUri: currentScene?.backgroundImageUri || undefined,
      storyTitle: story.title,
      sceneText,
      playTime: 0,
    };
  }
};
