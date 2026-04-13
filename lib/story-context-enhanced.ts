/**
 * Enhanced story context functions for editing and updating stories
 * These functions extend the base story context with editing capabilities
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Story, StoryScene, Choice } from './types';

export async function updateStory(story: Story): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem('stories');
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    
    const index = stories.findIndex((s: Story) => s.id === story.id);
    if (index >= 0) {
      stories[index] = { ...story, updatedAt: Date.now() };
    } else {
      stories.push({ ...story, updatedAt: Date.now() });
    }
    
    await AsyncStorage.setItem('stories', JSON.stringify(stories));
  } catch (error) {
    console.error('Failed to update story:', error);
    throw error;
  }
}

export async function updateScene(storyId: string, scene: StoryScene): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem('stories');
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    
    const story = stories.find((s: Story) => s.id === storyId);
    if (story) {
      story.scenes[scene.id] = scene;
      story.updatedAt = Date.now();
      await AsyncStorage.setItem('stories', JSON.stringify(stories));
    }
  } catch (error) {
    console.error('Failed to update scene:', error);
    throw error;
  }
}

export async function addScene(storyId: string, scene: StoryScene): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem('stories');
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    
    const story = stories.find((s: Story) => s.id === storyId);
    if (story) {
      story.scenes[scene.id] = scene;
      story.updatedAt = Date.now();
      await AsyncStorage.setItem('stories', JSON.stringify(stories));
    }
  } catch (error) {
    console.error('Failed to add scene:', error);
    throw error;
  }
}

export async function deleteScene(storyId: string, sceneId: string): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem('stories');
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    
    const story = stories.find((s: Story) => s.id === storyId);
    if (story && story.scenes[sceneId]) {
      delete story.scenes[sceneId];
      story.updatedAt = Date.now();
      await AsyncStorage.setItem('stories', JSON.stringify(stories));
    }
  } catch (error) {
    console.error('Failed to delete scene:', error);
    throw error;
  }
}

export async function addChoice(storyId: string, sceneId: string, choice: Choice): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem('stories');
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    
    const story = stories.find((s: Story) => s.id === storyId);
    if (story && story.scenes[sceneId]) {
      story.scenes[sceneId].choices.push(choice);
      story.updatedAt = Date.now();
      await AsyncStorage.setItem('stories', JSON.stringify(stories));
    }
  } catch (error) {
    console.error('Failed to add choice:', error);
    throw error;
  }
}

export async function deleteChoice(storyId: string, sceneId: string, choiceId: string): Promise<void> {
  try {
    const storiesJson = await AsyncStorage.getItem('stories');
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    
    const story = stories.find((s: Story) => s.id === storyId);
    if (story && story.scenes[sceneId]) {
      story.scenes[sceneId].choices = story.scenes[sceneId].choices.filter(
        (c: Choice) => c.id !== choiceId
      );
      story.updatedAt = Date.now();
      await AsyncStorage.setItem('stories', JSON.stringify(stories));
    }
  } catch (error) {
    console.error('Failed to delete choice:', error);
    throw error;
  }
}

export async function exportStory(storyId: string): Promise<string> {
  try {
    const storiesJson = await AsyncStorage.getItem('stories');
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    
    const story = stories.find((s: Story) => s.id === storyId);
    if (story) {
      return JSON.stringify(story, null, 2);
    }
    throw new Error('Story not found');
  } catch (error) {
    console.error('Failed to export story:', error);
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
    
    const storiesJson = await AsyncStorage.getItem('stories');
    const stories = storiesJson ? JSON.parse(storiesJson) : [];
    stories.push(story);
    
    await AsyncStorage.setItem('stories', JSON.stringify(stories));
    return story;
  } catch (error) {
    console.error('Failed to import story:', error);
    throw error;
  }
}
