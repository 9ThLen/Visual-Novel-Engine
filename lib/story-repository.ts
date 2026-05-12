import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './storage-keys';
import { Story, StoryScene, SaveSlot, UserSettings } from './types';
import { StoryMetadata, StoryDomain } from './story-domain';
import { retryAsync, ErrorHandler } from './error-handler';

export const StoryRepository = {
  async getAllStoriesMetadata(): Promise<StoryMetadata[]> {
    const storiesJson = await retryAsync(
      () => AsyncStorage.getItem(STORAGE_KEYS.STORIES),
      { maxRetries: 3, delayMs: 500 }
    );
    if (!storiesJson) return [];
    
    const parsed = JSON.parse(storiesJson);
    
    // Migration: If the first item has scenes, it's the old format
    if (parsed.length > 0 && parsed[0].scenes) {
      if (__DEV__) console.log('Migrating stories to new storage format...');
      const stories = parsed as Story[];
      
      const sceneMigrationPromises = stories.map((s: Story) => 
        AsyncStorage.setItem(STORAGE_KEYS.SCENES(s.id), JSON.stringify(s.scenes))
      );
      await Promise.all(sceneMigrationPromises);

      // Save metadata
      const metadata = stories.map(StoryDomain.extractMetadata);
      await AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(metadata));
      return metadata;
    }
    
    return parsed;
  },

  async saveStory(story: Story): Promise<void> {
    const metadata = StoryDomain.extractMetadata(story);
    const existingMetadata = await this.getAllStoriesMetadata();
    
    const index = existingMetadata.findIndex(m => m.id === metadata.id);
    let updatedMetadata: StoryMetadata[];
    if (index >= 0) {
      updatedMetadata = [...existingMetadata];
      updatedMetadata[index] = metadata;
    } else {
      updatedMetadata = [...existingMetadata, metadata];
    }

    await retryAsync(
      () => Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(updatedMetadata)),
        AsyncStorage.setItem(STORAGE_KEYS.SCENES(story.id), JSON.stringify(story.scenes))
      ]),
      { maxRetries: 3, delayMs: 500 }
    ).catch(error => {
      ErrorHandler.handleStorageError('save story', error, { storyId: story.id });
      throw error;
    });
  },

  async deleteStory(storyId: string): Promise<void> {
    const existingMetadata = await this.getAllStoriesMetadata();
    const updatedMetadata = existingMetadata.filter(m => m.id !== storyId);

    await retryAsync(
      () => Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(updatedMetadata)),
        AsyncStorage.removeItem(STORAGE_KEYS.SCENES(storyId))
      ]),
      { maxRetries: 3, delayMs: 500 }
    ).catch(error => {
      ErrorHandler.handleStorageError('delete story', error, { storyId });
      throw error;
    });
  },

  async getStoryScenes(storyId: string): Promise<Record<string, StoryScene>> {
    const scenesJson = await retryAsync(
      () => AsyncStorage.getItem(STORAGE_KEYS.SCENES(storyId)),
      { maxRetries: 3, delayMs: 500 }
    );
    return scenesJson ? JSON.parse(scenesJson) : {};
  },

  async getSaveSlots(): Promise<SaveSlot[]> {
    const slotsJson = await retryAsync(
      () => AsyncStorage.getItem(STORAGE_KEYS.SAVE_SLOTS),
      { maxRetries: 3, delayMs: 500 }
    );
    return slotsJson ? JSON.parse(slotsJson) : [];
  },

  async saveSaveSlots(slots: SaveSlot[]): Promise<void> {
    await retryAsync(
      () => AsyncStorage.setItem(STORAGE_KEYS.SAVE_SLOTS, JSON.stringify(slots)),
      { maxRetries: 3, delayMs: 500 }
    ).catch(error => {
      ErrorHandler.handleStorageError('save save slots', error);
      throw error;
    });
  },

  async getSettings(): Promise<UserSettings | null> {
    const settingsJson = await retryAsync(
      () => AsyncStorage.getItem(STORAGE_KEYS.SETTINGS),
      { maxRetries: 3, delayMs: 500 }
    );
    return settingsJson ? JSON.parse(settingsJson) : null;
  },

  async saveSettings(settings: UserSettings): Promise<void> {
    await retryAsync(
      () => AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)),
      { maxRetries: 3, delayMs: 500 }
    ).catch(error => {
      ErrorHandler.handleStorageError('save settings', error);
      throw error;
    });
  }
};
