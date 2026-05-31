import { PlaybackState } from './engine/types';

export interface StoryMetadata {
  id: string;
  title: string;
  description?: string;
  author?: string;
  startSceneId: string;
  createdAt: number;
  updatedAt: number;
  thumbnailUri?: string;
  sceneCount: number;
}

export interface StoryMetadataInput extends Omit<StoryMetadata, 'sceneCount'> {
  sceneCount?: number;
  scenes?: Record<string, unknown>;
  audioLibrary?: unknown;
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
      timestamp: Date.now(),
      sceneName: sceneTitle,
      thumbnailUri: currentScene?.backgroundImageUri || undefined,
      storyTitle: story.title,
      sceneText,
      playTime: 0,
    };
  }
};
