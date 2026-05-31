/**
 * Audio Library Manager
 * Manages per-story audio libraries and trigger-based playback
 */

import type { AudioLibraryItem } from './audio-types';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { useAppStore } from '@/stores/use-app-store';
import { generateId } from './id-utils';
import type { LibraryAsset } from './media-library-service';

/**
 * Get audio library for a story
 */
export async function getAudioLibrary(storyId: string): Promise<AudioLibraryItem[]> {
  try {
    return useAppStore.getState().audioLibraries[storyId] || [];
  } catch (error) {
    ErrorHandler.handle('Failed to get audio library', error, ErrorCategory.STORAGE);
    return [];
  }
}

function inferAudioItemType(name: string): AudioLibraryItem['type'] {
  const normalizedName = name.toLowerCase();
  if (normalizedName.includes('voice')) {
    return 'voice';
  }

  if (normalizedName.includes('music') || normalizedName.includes('theme') || normalizedName.includes('bgm')) {
    return 'music';
  }

  return 'sfx';
}

function mediaAssetToAudioItem(asset: LibraryAsset): AudioLibraryItem | null {
  if (asset.type !== 'audio') {
    return null;
  }

  return {
    id: asset.id,
    name: asset.name,
    uri: asset.uri,
    type: inferAudioItemType(asset.name),
    loop: false,
    volume: 1,
    createdAt: asset.addedAt,
    tags: [],
  };
}

export function buildPlaybackAudioLibraryItems(
  storyLibrary: AudioLibraryItem[],
  mediaLibrary: LibraryAsset[]
): AudioLibraryItem[] {
  const merged = new Map<string, AudioLibraryItem>();

  for (const asset of mediaLibrary) {
    const item = mediaAssetToAudioItem(asset);
    if (item) {
      merged.set(item.id, item);
    }
  }

  for (const item of storyLibrary) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values());
}

export async function getPlaybackAudioLibrary(storyId: string): Promise<AudioLibraryItem[]> {
  const storyLibrary = await getAudioLibrary(storyId);
  return buildPlaybackAudioLibraryItems(storyLibrary, useAppStore.getState().mediaLibrary);
}

/**
 * Save audio library for a story
 */
export async function saveAudioLibrary(
  storyId: string,
  library: AudioLibraryItem[]
): Promise<void> {
  try {
    useAppStore.getState().setAudioLibrary(storyId, library);
  } catch (error) {
    ErrorHandler.handle('Failed to save audio library', error, ErrorCategory.STORAGE);
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
      id: generateId('audio', 9),
      createdAt: Date.now(),
    };

    const updated = [...library, newItem];
    await saveAudioLibrary(storyId, updated);

    return newItem;
  } catch (error) {
    ErrorHandler.handle('Failed to add audio to library', error, ErrorCategory.STORAGE);
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
      throw ErrorHandler.handleValidationError('Audio item not found in library');
    }

    const updated = library.map((item, i) => i === index ? { ...item, ...updates } : item);
    await saveAudioLibrary(storyId, updated);
  } catch (error) {
    ErrorHandler.handle('Failed to update audio in library', error, ErrorCategory.STORAGE);
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
    ErrorHandler.handle('Failed to delete audio from library', error, ErrorCategory.STORAGE);
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
    ErrorHandler.handle('Failed to search audio library', error, ErrorCategory.STORAGE);
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
    ErrorHandler.handle('Failed to get audio by type', error, ErrorCategory.STORAGE);
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
      id: generateId('audio', 9),
      createdAt: Date.now(),
    }));

    await saveAudioLibrary(targetStoryId, [...targetLibrary, ...importedItems]);
  } catch (error) {
    ErrorHandler.handle('Failed to import audio library', error, ErrorCategory.STORAGE);
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
    ErrorHandler.handle('Failed to export audio library', error, ErrorCategory.STORAGE);
    throw error;
  }
}
