import { Story, StoryScene, PlaybackState, SaveSlot } from './types';

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

export const StoryDomain = {
  extractMetadata(story: Story): StoryMetadata {
    const { scenes, audioLibrary, ...metadata } = story;
    return {
      ...metadata,
      sceneCount: Object.keys(scenes || {}).length
    };
  },

  createSaveSlot(
    slotId: string,
    story: Story,
    playbackState: PlaybackState,
    currentScene?: StoryScene
  ): SaveSlot {
    // Extract first line of dialogue for preview - safe access
    const sceneText = currentScene?.text?.split('\n')[0]?.slice(0, 100) || '';

    return {
      id: slotId,
      storyId: story.id,
      sceneId: playbackState.currentSceneId,
      choicesMade: playbackState.choicesMade,
      timestamp: Date.now(),
      sceneName: currentScene?.id,
      thumbnailUri: currentScene?.backgroundImageUri || undefined,
      storyTitle: story.title,
      sceneText,
      playTime: 0, // TODO: Track actual play time
    };
  }
};
