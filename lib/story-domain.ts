import type { PlaybackState, RuntimeVariables } from './engine/runtime-types';
import type { SceneRecord } from './engine/types';
import type { Character } from './character-types';
import type { AudioLibraryItem } from './audio-types';
import {
  DEFAULT_READER_LAYOUT_PRESET,
  sanitizeReaderLayoutPreset,
  sanitizeStoryTheme,
  type StoryReaderLayoutPreset,
  type StoryReaderTheme,
} from './story-theme';
import {
  STORY_PUBLICATION_KEYS,
  sanitizeStoryPublication,
  type StoryPublicationMetadata,
} from './story-publication';

/**
 * The publication fields (`StoryPublicationMetadata`) are optional on every
 * story and stay absent until the author fills them in for a release, so
 * adding them invalidates nothing that already exists.
 */
export interface StoryMetadata extends StoryPublicationMetadata {
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
  readerLayoutPreset?: StoryReaderLayoutPreset;
}

export const MAX_STORY_TAGS = 20;
export const MAX_STORY_TAG_LENGTH = 40;

export function sanitizeStoryTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim().slice(0, MAX_STORY_TAG_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(trimmed);
    if (tags.length >= MAX_STORY_TAGS) break;
  }
  return tags.length > 0 ? tags : undefined;
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
  const tags = sanitizeStoryTags(metadata.tags);
  if (tags) {
    normalized.tags = tags;
  } else {
    delete normalized.tags;
  }
  if (theme) {
    normalized.theme = theme;
  } else {
    delete normalized.theme;
  }
  const readerLayoutPreset = sanitizeReaderLayoutPreset(metadata.readerLayoutPreset);
  if (readerLayoutPreset !== DEFAULT_READER_LAYOUT_PRESET) {
    normalized.readerLayoutPreset = readerLayoutPreset;
  } else {
    delete normalized.readerLayoutPreset;
  }

  const publication = sanitizeStoryPublication(metadata);
  for (const key of STORY_PUBLICATION_KEYS) {
    if (publication[key] === undefined) delete normalized[key];
  }
  Object.assign(normalized, publication);

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
  audioLibrary?: AudioLibraryItem[];
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
