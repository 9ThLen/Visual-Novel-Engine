/**
 * Story hooks — convenience wrappers around useAppStore
 *
 * Provides useStoryState() and useStoryActions() for components
 * that need story-related state and actions.
 */

import { useAppStore, selectStoryScenes, selectStoryMetadata } from '@/stores/use-app-store';
import type { Story } from '@/lib/types';
import { StoryValidator, ValidationError } from '@/lib/story-validator';
import demoStory from '@/assets/demo-story.json';
import { useAutoSave } from '@/hooks/useAutoSave';
import { generateId } from '@/lib/id-utils';
import { buildRuntimeStoriesSnapshot, buildRuntimeStorySnapshot } from '@/lib/runtime-story';
import { normalizeUserSettings } from '@/lib/user-settings';

// ── Story import / export — thin wrappers with validation ──

const MAX_JSON_SIZE = 10 * 1024 * 1024;

export async function exportStory(storyId: string): Promise<string> {
  const state = useAppStore.getState();
  const metadata = selectStoryMetadata(storyId)(state);
  if (!metadata) throw new Error('Story not found');
  const scenes = selectStoryScenes(storyId)(state);
  const { sceneCount, ...rest } = metadata;
  const story: Story = { ...rest, scenes };
  return JSON.stringify(story, null, 2);
}

export async function importStory(storyJson: string): Promise<Story> {
  if (storyJson.length > MAX_JSON_SIZE) {
    throw new ValidationError(`Story JSON is too large (max ${MAX_JSON_SIZE / 1024 / 1024}MB)`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(storyJson);
  } catch {
    throw new ValidationError('Invalid JSON format');
  }

  const story = StoryValidator.validateStory(parsed as Record<string, unknown>);
  story.id = generateId('story');
  story.createdAt = Date.now();
  story.updatedAt = Date.now();

  useAppStore.getState().addStory(story);
  return story;
}

// ── Auto-save component ──

export function StoryAutoSave() {
  const playbackState = useAppStore((s) => s.playbackState);
  const syncAutoSave = useAppStore((s) => s.syncAutoSave);

  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const scenesByStory = useAppStore((s) => s.scenesByStory);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);

  useAutoSave({
    playbackState,
    runtimeSnapshot: { storiesMetadata, scenesByStory, sceneRecordsByStory },
    onAutoSave: async (newSlot) => { syncAutoSave(newSlot); },
    enabled: !!playbackState?.isPlaying,
  });

  return null;
}

// ── State selector hook ──

export function useStoryState() {
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const currentStoryId = useAppStore((s) => s.currentStoryId);
  const scenesByStory = useAppStore((s) => s.scenesByStory);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);
  const playbackState = useAppStore((s) => s.playbackState);
  const rawSettings = useAppStore((s) => s.settings);
  const settings = normalizeUserSettings(rawSettings);
  const saveSlots = useAppStore((s) => s.saveSlots);
  const isLoaded = useAppStore((s) => s.isLoaded);

  // Reconstruct current Story object from metadata + scenes
  const currentStory = currentStoryId
    ? buildRuntimeStorySnapshot({ storiesMetadata, scenesByStory, sceneRecordsByStory }, currentStoryId)
    : null;

  // All stories as Story objects
  const stories = buildRuntimeStoriesSnapshot({ storiesMetadata, scenesByStory, sceneRecordsByStory });

  return {
    stories,
    storiesMetadata,
    currentStory,
    currentStoryId,
    scenesByStory,
    sceneRecordsByStory,
    playbackState,
    settings,
    saveSlots,
    isLoaded,
  };
}

// ── Actions hook ──

export function useStoryActions() {
  const loadCurrentStory = useAppStore((s) => s.loadCurrentStory);
  const createStory = useAppStore((s) => s.createStory);
  const addStory = useAppStore((s) => s.addStory);
  const deleteStory = useAppStore((s) => s.deleteStory);
  const saveScene = useAppStore((s) => s.saveScene);
  const deleteScene = useAppStore((s) => s.deleteScene);
  const addChoice = useAppStore((s) => s.addChoice);
  const deleteChoice = useAppStore((s) => s.deleteChoice);
  const saveGame = useAppStore((s) => s.saveGame);
  const loadGame = useAppStore((s) => s.loadGame);
  const deleteSaveSlot = useAppStore((s) => s.deleteSaveSlot);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const updatePlaybackState = useAppStore((s) => s.updatePlaybackState);
  const setMediaLibrary = useAppStore((s) => s.setMediaLibrary);

  // Load stories from storage (migration)
  const loadStories = useAppStore((s) => s.migrateFromLegacyKeys);

  // Set current story by ID
  const setCurrentStory = (storyId: string | null) => {
    return loadCurrentStory(storyId);
  };

  return {
    loadStories,
    createStory,
    setCurrentStory,
    addStory,
    deleteStory,
    saveScene,
    deleteScene,
    addChoice,
    deleteChoice,
    saveGame,
    loadGame,
    deleteSaveSlot,
    updateSettings,
    setLanguage,
    updatePlaybackState,
    setMediaLibrary,
  };
}
