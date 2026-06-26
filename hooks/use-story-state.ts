/**
 * Story state and actions hooks — wrappers around useAppStore.
 *
 * Provides useStoryState() and useStoryActions() for components
 * that need story-related state and actions.
 *
 * Extracted from lib/story-hooks.ts so UI code can import story state
 * hooks without going through import/export helpers.
 */

import { useMemo } from 'react';
import { useAppStore } from '@/stores/use-app-store';
import { normalizeUserSettings } from '@/lib/user-settings';
import type { CanonicalStory, StoryMetadata } from '@/lib/story-domain';

function buildCanonicalStory(metadata: StoryMetadata, scenes: Record<string, unknown>): CanonicalStory {
  return {
    ...metadata,
    sceneCount: Object.keys(scenes).length,
    scenes: scenes as CanonicalStory['scenes'],
  };
}

export function useStoryState() {
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const currentStoryId = useAppStore((s) => s.currentStoryId);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);
  const playbackState = useAppStore((s) => s.playbackState);
  const rawSettings = useAppStore((s) => s.settings);
  const settings = normalizeUserSettings(rawSettings);
  const saveSlots = useAppStore((s) => s.saveSlots);
  const isLoaded = useAppStore((s) => s.isLoaded);

  const currentMetadata = currentStoryId
    ? storiesMetadata.find((story) => story.id === currentStoryId)
    : null;
  const currentStory = useMemo(
    () => currentMetadata
      ? buildCanonicalStory(currentMetadata, sceneRecordsByStory[currentMetadata.id] || {})
      : null,
    [currentMetadata, sceneRecordsByStory],
  );
  const stories = useMemo(
    () => storiesMetadata.map((metadata) =>
      buildCanonicalStory(metadata, sceneRecordsByStory[metadata.id] || {}),
    ),
    [storiesMetadata, sceneRecordsByStory],
  );

  return {
    stories,
    storiesMetadata,
    currentStory,
    currentStoryId,
    sceneRecordsByStory,
    playbackState,
    settings,
    saveSlots,
    isLoaded,
  };
}

export function useStoryActions() {
  const loadCurrentStory = useAppStore((s) => s.loadCurrentStory);
  const createStory = useAppStore((s) => s.createStory);
  const addStory = useAppStore((s) => s.addStory);
  const deleteStory = useAppStore((s) => s.deleteStory);
  const deleteScene = useAppStore((s) => s.deleteScene);
  const saveGame = useAppStore((s) => s.saveGame);
  const loadGame = useAppStore((s) => s.loadGame);
  const deleteSaveSlot = useAppStore((s) => s.deleteSaveSlot);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const updatePlaybackState = useAppStore((s) => s.updatePlaybackState);
  const setMediaLibrary = useAppStore((s) => s.setMediaLibrary);

  const migrateLegacyKeys = useAppStore((s) => s.migrateFromLegacyKeys);

  const setCurrentStory = (storyId: string | null) => {
    return loadCurrentStory(storyId);
  };

  return {
    migrateLegacyKeys,
    /** @deprecated Use migrateLegacyKeys. */
    loadStories: migrateLegacyKeys,
    createStory,
    setCurrentStory,
    addStory,
    deleteStory,
    deleteScene,
    saveGame,
    loadGame,
    deleteSaveSlot,
    updateSettings,
    setLanguage,
    updatePlaybackState,
    setMediaLibrary,
  };
}
