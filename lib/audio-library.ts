/**
 * Audio Library Manager
 * Manages per-story audio libraries and trigger-based playback
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AudioLibraryItem, StoryWithAudio } from './audio-types';

const AUDIO_LIBRARY_KEY = 'audio_libraries';

/**
 * Get audio library for a story
 */
export async function getAudioLibrary(storyId: string): Promise<AudioLibraryItem[]> {
  try {
    const data = await AsyncStorage.getItem(`${AUDIO_LIBRARY_KEY}_${storyId}`);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get audio library:', error);
    return [];
  }
}

/**
 * Save audio library for a story
 */
export async function saveAudioLibrary(
  storyId: string,
  library: AudioLibraryItem[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${AUDIO_LIBRARY_KEY}_${storyId}`,
      JSON.stringify(library)
    );
  } catch (error) {
    console.error('Failed to save audio library:', error);
    throw error;
  }
}

/**
 * Add audio item to library
 */
export async function addAudioToLibrary(
  storyId: string,
  item: Omit<AudioLibraryItem, 'id' | 'createdAt'>
): Promise<AudioLibraryItem> {
  try {
    const library = await getAudioLibrary(storyId);

    const newItem: AudioLibraryItem = {
      ...item,
      id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    };

    library.push(newItem);
    await saveAudioLibrary(storyId, library);

    return newItem;
  } catch (error) {
    console.error('Failed to add audio to library:', error);
    throw error;
  }
}

/**
 * Update audio item in library
 */
export async function updateAudioInLibrary(
  storyId: string,
  audioId: string,
  updates: Partial<AudioLibraryItem>
): Promise<void> {
  try {
    const library = await getAudioLibrary(storyId);
    const index = library.findIndex((item) => item.id === audioId);

    if (index === -1) {
      throw new Error('Audio item not found');
    }

    library[index] = { ...library[index], ...updates };
    await saveAudioLibrary(storyId, library);
  } catch (error) {
    console.error('Failed to update audio in library:', error);
    throw error;
  }
}

/**
 * Delete audio item from library
 */
export async function deleteAudioFromLibrary(
  storyId: string,
  audioId: string
): Promise<void> {
  try {
    const library = await getAudioLibrary(storyId);
    const filtered = library.filter((item) => item.id !== audioId);
    await saveAudioLibrary(storyId, filtered);
  } catch (error) {
    console.error('Failed to delete audio from library:', error);
    throw error;
  }
}

/**
 * Search audio library by tags or name
 */
export async function searchAudioLibrary(
  storyId: string,
  query: string
): Promise<AudioLibraryItem[]> {
  try {
    const library = await getAudioLibrary(storyId);
    const lowerQuery = query.toLowerCase();

    return library.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(lowerQuery);
      const tagMatch = item.tags?.some((tag) =>
        tag.toLowerCase().includes(lowerQuery)
      );
      return nameMatch || tagMatch;
    });
  } catch (error) {
    console.error('Failed to search audio library:', error);
    return [];
  }
}

/**
 * Get audio items by type
 */
export async function getAudioByType(
  storyId: string,
  type: AudioLibraryItem['type']
): Promise<AudioLibraryItem[]> {
  try {
    const library = await getAudioLibrary(storyId);
    return library.filter((item) => item.type === type);
  } catch (error) {
    console.error('Failed to get audio by type:', error);
    return [];
  }
}

/**
 * Import audio library from another story
 */
export async function importAudioLibrary(
  targetStoryId: string,
  sourceStoryId: string
): Promise<void> {
  try {
    const sourceLibrary = await getAudioLibrary(sourceStoryId);
    const targetLibrary = await getAudioLibrary(targetStoryId);

    // Merge libraries, avoiding duplicates by URI
    const existingUris = new Set(targetLibrary.map((item) => item.uri));
    const newItems = sourceLibrary.filter((item) => !existingUris.has(item.uri));

    // Regenerate IDs for imported items
    const importedItems = newItems.map((item) => ({
      ...item,
      id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    }));

    await saveAudioLibrary(targetStoryId, [...targetLibrary, ...importedItems]);
  } catch (error) {
    console.error('Failed to import audio library:', error);
    throw error;
  }
}

/**
 * Export audio library as JSON
 */
export async function exportAudioLibrary(storyId: string): Promise<string> {
  try {
    const library = await getAudioLibrary(storyId);
    return JSON.stringify(library, null, 2);
  } catch (error) {
    console.error('Failed to export audio library:', error);
    throw error;
  }
}
