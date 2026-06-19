/**
 * Audio Library Store Actions
 *
 * Store-aware wrappers for audio-library operations.
 * This file is in stores/ and can safely import useAppStore.
 *
 * NOTE: Extracted from lib/audio-library.ts to resolve the layer boundary
 * violation (lib/ should not import from stores/).
 */

import { useAppStore } from './use-app-store';
import {
  getAudioLibraryPure,
  getPlaybackAudioLibraryPure,
  saveAudioLibraryPure,
  addAudioToLibraryPure,
  updateAudioInLibraryPure,
  deleteAudioFromLibraryPure,
  searchAudioLibraryPure,
  getAudioByTypePure,
  importAudioLibraryPure,
  exportAudioLibraryPure,
} from '@/lib/audio-library';
import type { AudioLibraryItem } from '@/lib/audio-types';

export async function getAudioLibrary(storyId: string): Promise<AudioLibraryItem[]> {
  const audioLibraries = useAppStore.getState().audioLibraries;
  return getAudioLibraryPure(storyId, audioLibraries);
}

export async function getPlaybackAudioLibrary(storyId: string): Promise<AudioLibraryItem[]> {
  const state = useAppStore.getState();
  return getPlaybackAudioLibraryPure(storyId, state.audioLibraries, state.mediaLibrary);
}

export async function saveAudioLibrary(storyId: string, library: AudioLibraryItem[]): Promise<void> {
  useAppStore.getState().setAudioLibrary(storyId, library);
}

export async function addAudioToLibrary(
  storyId: string,
  item: Omit<AudioLibraryItem, 'id' | 'createdAt'>,
): Promise<AudioLibraryItem> {
  const library = await getAudioLibrary(storyId);
  return addAudioToLibraryPure(storyId, item, library);
}

export async function updateAudioInLibrary(
  storyId: string,
  audioId: string,
  updates: Partial<AudioLibraryItem>,
): Promise<AudioLibraryItem[]> {
  const library = await getAudioLibrary(storyId);
  return updateAudioInLibraryPure(storyId, audioId, updates, library);
}

export async function deleteAudioFromLibrary(storyId: string, audioId: string): Promise<AudioLibraryItem[]> {
  const library = await getAudioLibrary(storyId);
  return deleteAudioFromLibraryPure(storyId, audioId, library);
}

export async function searchAudioLibrary(storyId: string, query: string): Promise<AudioLibraryItem[]> {
  const library = await getAudioLibrary(storyId);
  return searchAudioLibraryPure(storyId, query, library);
}

export async function getAudioByType(
  storyId: string,
  type: AudioLibraryItem['type'],
): Promise<AudioLibraryItem[]> {
  const library = await getAudioLibrary(storyId);
  return getAudioByTypePure(storyId, type, library);
}

export async function importAudioLibrary(targetStoryId: string, sourceStoryId: string): Promise<AudioLibraryItem[]> {
  const sourceLibrary = await getAudioLibrary(sourceStoryId);
  const targetLibrary = await getAudioLibrary(targetStoryId);
  return importAudioLibraryPure(targetStoryId, sourceStoryId, sourceLibrary, targetLibrary);
}

export async function exportAudioLibrary(storyId: string): Promise<string> {
  const library = await getAudioLibrary(storyId);
  return exportAudioLibraryPure(storyId, library);
}
