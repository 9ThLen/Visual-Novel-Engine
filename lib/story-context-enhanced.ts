/**
 * Enhanced story context functions for editing and updating stories
 * These functions extend the base story context with editing capabilities
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Story, StoryScene, Choice } from './types';
import { STORAGE_KEYS } from './storage-keys';

export async function updateStory(story: Story): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    
    const index = stories.findIndex((s: Story) => s.id === story.id);
    if (index >= 0) {
      stories[index] = { ...story, updatedAt: Date.now() };
    } else {
      stories.push({ ...story, updatedAt: Date.now() });
    }
    
    await AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
  } catch (error) {
    if (__DEV__) console.error('Failed to update story:', error);
    throw error;
  }
}

export async function updateScene(storyId: string, scene: StoryScene): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    const stories = storiesJson ? JSON.parse(storiesJson) : [];

    const storyIndex = stories.findIndex((s: Story) => s.id === storyId);
    if (storyIndex === -1) {
      throw new Error(`Story with id ${storyId} not found`);
    }

    // Create updated story without mutation
    stories[storyIndex] = {
      ...stories[storyIndex],
      scenes: {
        ...stories[storyIndex].scenes,
        [scene.id]: scene
      },
      updatedAt: Date.now()
    };
    await AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
  } catch (error) {
    if (__DEV__) console.error('Failed to update scene:', error);
    throw error;
  }
}

export async function addScene(storyId: string, scene: StoryScene): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    const stories = storiesJson ? JSON.parse(storiesJson) : [];

    const storyIndex = stories.findIndex((s: Story) => s.id === storyId);
    if (storyIndex === -1) {
      throw new Error(`Story with id ${storyId} not found`);
    }

    // Create updated story without mutation
    stories[storyIndex] = {
      ...stories[storyIndex],
      scenes: {
        ...stories[storyIndex].scenes,
        [scene.id]: scene
      },
      updatedAt: Date.now()
    };
    await AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
  } catch (error) {
    if (__DEV__) console.error('Failed to add scene:', error);
    throw error;
  }
}

export async function deleteScene(storyId: string, sceneId: string): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    const stories = storiesJson ? JSON.parse(storiesJson) : [];

    const storyIndex = stories.findIndex((s: Story) => s.id === storyId);
    if (storyIndex === -1) {
      throw new Error(`Story with id ${storyId} not found`);
    }

    if (!stories[storyIndex].scenes[sceneId]) {
      throw new Error(`Scene with id ${sceneId} not found in story ${storyId}`);
    }

    // Create updated story without mutation
    const updatedScenes = { ...stories[storyIndex].scenes };
    delete updatedScenes[sceneId];

    stories[storyIndex] = {
      ...stories[storyIndex],
      scenes: updatedScenes,
      updatedAt: Date.now()
    };
    await AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
  } catch (error) {
    if (__DEV__) console.error('Failed to delete scene:', error);
    throw error;
  }
}

export async function addChoice(storyId: string, sceneId: string, choice: Choice): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    const stories = storiesJson ? JSON.parse(storiesJson) : [];

    const storyIndex = stories.findIndex((s: Story) => s.id === storyId);
    if (storyIndex === -1) {
      throw new Error(`Story with id ${storyId} not found`);
    }

    if (!stories[storyIndex].scenes[sceneId]) {
      throw new Error(`Scene with id ${sceneId} not found in story ${storyId}`);
    }

    // Create updated story without mutation
    stories[storyIndex] = {
      ...stories[storyIndex],
      scenes: {
        ...stories[storyIndex].scenes,
        [sceneId]: {
          ...stories[storyIndex].scenes[sceneId],
          choices: [...stories[storyIndex].scenes[sceneId].choices, choice]
        }
      },
      updatedAt: Date.now()
    };
    await AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
  } catch (error) {
    if (__DEV__) console.error('Failed to add choice:', error);
    throw error;
  }
}

export async function deleteChoice(storyId: string, sceneId: string, choiceId: string): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    const stories = storiesJson ? JSON.parse(storiesJson) : [];

    const storyIndex = stories.findIndex((s: Story) => s.id === storyId);
    if (storyIndex === -1) {
      throw new Error(`Story with id ${storyId} not found`);
    }

    if (!stories[storyIndex].scenes[sceneId]) {
      throw new Error(`Scene with id ${sceneId} not found in story ${storyId}`);
    }

    // Create updated story without mutation
    stories[storyIndex] = {
      ...stories[storyIndex],
      scenes: {
        ...stories[storyIndex].scenes,
        [sceneId]: {
          ...stories[storyIndex].scenes[sceneId],
          choices: stories[storyIndex].scenes[sceneId].choices.filter(
            (c: Choice) => c.id !== choiceId
          )
        }
      },
      updatedAt: Date.now()
    };
    await AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
  } catch (error) {
    if (__DEV__) console.error('Failed to delete choice:', error);
    throw error;
  }
}

export async function exportStory(storyId: string): Promise<string> {
  try {
    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    
    const story = stories.find((s: Story) => s.id === storyId);
    if (story) {
      return JSON.stringify(story, null, 2);
    }
    throw new Error('Story not found');
  } catch (error) {
    if (__DEV__) console.error('Failed to export story:', error);
    throw error;
  }
}

export async function importStory(storyJson: string): Promise<Story> {
  try {
    const story = JSON.parse(storyJson) as Story;
    
    // Validate story structure
    if (!story.id || !story.title || !story.startSceneId || !story.scenes) {
      throw new Error('Invalid story structure');
    }
    
    // Generate new ID to avoid conflicts
    story.id = `story-${Date.now()}`;
    story.createdAt = Date.now();
    story.updatedAt = Date.now();
    
    const storiesJson = await AsyncStorage.getItem(STORAGE_KEYS.STORIES);
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    stories.push(story);
    
    await AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
    return story;
  } catch (error) {
    if (__DEV__) console.error('Failed to import story:', error);
    throw error;
  }
}
