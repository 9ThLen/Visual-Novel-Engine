/**
 * Audio Library Manager
 * Manages per-story audio libraries and trigger-based playback
 *
 * NOTE: This file contains only pure functions. Store access is in
 * stores/audio-library-actions.ts. This resolves the layer boundary
 * violation (lib/ should not import from stores/).
 */

import type { AudioLibraryItem } from './audio-types';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { generateId } from './id-utils';
import type { LibraryAsset } from './media-library-service';

/**
 * Get audio library for a story (pure function — accepts state as parameter)
 */
export function getAudioLibraryPure(
  storyId: string,
  audioLibraries: Record<string, AudioLibraryItem[]>,
): AudioLibraryItem[] {
  try {
    return audioLibraries[storyId] || [];
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
  mediaLibrary: LibraryAsset[],
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

/**
 * Get playback audio library (pure function — accepts state as parameters)
 */
export function getPlaybackAudioLibraryPure(
  storyId: string,
  audioLibraries: Record<string, AudioLibraryItem[]>,
  mediaLibrary: LibraryAsset[],
): AudioLibraryItem[] {
  const storyLibrary = getAudioLibraryPure(storyId, audioLibraries);
  return buildPlaybackAudioLibraryItems(storyLibrary, mediaLibrary);
}

/**
 * Save audio library for a story (pure function — returns new state)
 */
export function saveAudioLibraryPure(
  storyId: string,
  library: AudioLibraryItem[],
  audioLibraries: Record<string, AudioLibraryItem[]>,
): Record<string, AudioLibraryItem[]> {
  try {
    return { ...audioLibraries, [storyId]: library };
  } catch (error) {
    ErrorHandler.handle('Failed to save audio library', error, ErrorCategory.STORAGE);
    throw error;
  }
}

/**
 * Add audio item to library (pure function)
 */
export function addAudioToLibraryPure(
  storyId: string,
  item: Omit<AudioLibraryItem, 'id' | 'createdAt'>,
  library: AudioLibraryItem[],
): AudioLibraryItem {
  try {
    const newItem: AudioLibraryItem = {
      ...item,
      id: generateId('audio', 9),
      createdAt: Date.now(),
    };
    return newItem;
  } catch (error) {
    ErrorHandler.handle('Failed to add audio to library', error, ErrorCategory.STORAGE);
    throw error;
  }
}

/**
 * Update audio item in library (pure function)
 */
export function updateAudioInLibraryPure(
  storyId: string,
  audioId: string,
  updates: Partial<AudioLibraryItem>,
  library: AudioLibraryItem[],
): AudioLibraryItem[] {
  try {
    const index = library.findIndex((item) => item.id === audioId);
    if (index === -1) {
      throw ErrorHandler.handleValidationError('Audio item not found in library');
    }
    return library.map((item, i) => i === index ? { ...item, ...updates } : item);
  } catch (error) {
    ErrorHandler.handle('Failed to update audio in library', error, ErrorCategory.STORAGE);
    throw error;
  }
}

/**
 * Delete audio item from library (pure function)
 */
export function deleteAudioFromLibraryPure(
  storyId: string,
  audioId: string,
  library: AudioLibraryItem[],
): AudioLibraryItem[] {
  try {
    return library.filter((item) => item.id !== audioId);
  } catch (error) {
    ErrorHandler.handle('Failed to delete audio from library', error, ErrorCategory.STORAGE);
    throw error;
  }
}

/**
 * Search audio library by tags or name (pure function)
 */
export function searchAudioLibraryPure(
  storyId: string,
  query: string,
  library: AudioLibraryItem[],
): AudioLibraryItem[] {
  try {
    const lowerQuery = query.toLowerCase();
    return library.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(lowerQuery);
      const tagMatch = item.tags?.some((tag) =>
        tag.toLowerCase().includes(lowerQuery),
      );
      return nameMatch || tagMatch;
    });
  } catch (error) {
    ErrorHandler.handle('Failed to search audio library', error, ErrorCategory.STORAGE);
    return [];
  }
}

/**
 * Get audio items by type (pure function)
 */
export function getAudioByTypePure(
  storyId: string,
  type: AudioLibraryItem['type'],
  library: AudioLibraryItem[],
): AudioLibraryItem[] {
  try {
    return library.filter((item) => item.type === type);
  } catch (error) {
    ErrorHandler.handle('Failed to get audio by type', error, ErrorCategory.STORAGE);
    return [];
  }
}

/**
 * Import audio library from another story (pure function)
 */
export function importAudioLibraryPure(
  targetStoryId: string,
  sourceStoryId: string,
  sourceLibrary: AudioLibraryItem[],
  targetLibrary: AudioLibraryItem[],
): AudioLibraryItem[] {
  try {
    const existingUris = new Set(targetLibrary.map((item) => item.uri));
    const newItems = sourceLibrary.filter((item) => !existingUris.has(item.uri));
    const importedItems = newItems.map((item) => ({
      ...item,
      id: generateId('audio', 9),
      createdAt: Date.now(),
    }));
    return [...targetLibrary, ...importedItems];
  } catch (error) {
    ErrorHandler.handle('Failed to import audio library', error, ErrorCategory.STORAGE);
    throw error;
  }
}

/**
 * Export audio library as JSON (pure function)
 */
export function exportAudioLibraryPure(
  storyId: string,
  library: AudioLibraryItem[],
): string {
  try {
    return JSON.stringify(library, null, 2);
  } catch (error) {
    ErrorHandler.handle('Failed to export audio library', error, ErrorCategory.STORAGE);
    throw error;
  }
}
