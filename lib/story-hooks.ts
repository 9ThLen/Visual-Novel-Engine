/**
 * Story hooks — convenience wrappers around useAppStore
 *
 * Provides useStoryState() and useStoryActions() for components
 * that need story-related state and actions.
 */

import { useAppStore, selectStoryMetadata } from '@/stores/use-app-store';
import { buildCanonicalSceneRecordsFromLegacyScenes } from '@/lib/scene-operations';
import { StoryValidator, ValidationError } from '@/lib/story-validator';
import { useAutoSave } from '@/hooks/useAutoSave';
import { generateId } from '@/lib/id-utils';
import { normalizeUserSettings } from '@/lib/user-settings';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { normalizeEditorTimeline } from '@/lib/editor-scene-draft';

// ── Story import / export — thin wrappers with validation ──

const MAX_JSON_SIZE = 10 * 1024 * 1024;

export interface CanonicalStory extends Omit<StoryMetadata, 'sceneCount'> {
  sceneCount?: number;
  scenes: Record<string, SceneRecord>;
}

function buildCanonicalStory(metadata: StoryMetadata, scenes: Record<string, SceneRecord>): CanonicalStory {
  return {
    ...metadata,
    sceneCount: Object.keys(scenes).length,
    scenes,
  };
}

function normalizeImportedSceneRecords(
  storyId: string,
  scenes: Record<string, SceneRecord>,
): Record<string, SceneRecord> {
  const timestamp = Date.now();
  return Object.fromEntries(
    Object.entries(scenes).map(([sceneId, scene]) => [
      sceneId,
      {
        ...scene,
        id: scene.id || sceneId,
        storyId,
        timeline: normalizeEditorTimeline(scene.timeline ?? []),
        createdAt: scene.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
    ]),
  );
}

export async function exportStory(storyId: string): Promise<string> {
  const state = useAppStore.getState();
  const metadata = selectStoryMetadata(storyId)(state);
  if (!metadata) throw new Error('Story not found');
  const scenes = state.sceneRecordsByStory[storyId] || {};
  const story = buildCanonicalStory(metadata, scenes);
  return JSON.stringify(story, null, 2);
}

export async function importStory(storyJson: string): Promise<CanonicalStory> {
  if (storyJson.length > MAX_JSON_SIZE) {
    throw new ValidationError(`Story JSON is too large (max ${MAX_JSON_SIZE / 1024 / 1024}MB)`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(storyJson);
  } catch {
    throw new ValidationError('Invalid JSON format');
  }

  const raw = parsed as Record<string, unknown>;
  const rawScenes = raw.scenes;
  const looksCanonical = rawScenes && typeof rawScenes === 'object'
    && Object.values(rawScenes as Record<string, unknown>).some((scene) =>
      !!scene && typeof scene === 'object' && Array.isArray((scene as { timeline?: unknown }).timeline),
    );

  if (looksCanonical) {
    if (typeof raw.title !== 'string' || !raw.title.trim()) {
      throw new ValidationError('Imported canonical story must have a non-empty title', 'title');
    }
    const sceneKeys = Object.keys(rawScenes as Record<string, unknown>);
    if (sceneKeys.length === 0) {
      throw new ValidationError('Imported canonical story must have at least one scene', 'scenes');
    }
    if (typeof raw.startSceneId !== 'string' || !raw.startSceneId) {
      throw new ValidationError('Imported canonical story must have a startSceneId', 'startSceneId');
    }
    if (!(raw.startSceneId in (rawScenes as Record<string, unknown>))) {
      throw new ValidationError(`startSceneId "${raw.startSceneId}" does not reference an existing scene`, 'startSceneId');
    }
    for (const [sceneId, scene] of Object.entries(rawScenes as Record<string, unknown>)) {
      if (!scene || typeof scene !== 'object') {
        throw new ValidationError(`Scene "${sceneId}" must be an object`, `scenes.${sceneId}`);
      }
      const s = scene as Record<string, unknown>;
      if (!Array.isArray(s.timeline)) {
        throw new ValidationError(`Scene "${sceneId}" must have a timeline array`, `scenes.${sceneId}.timeline`);
      }
    }
    const timestamp = Date.now();
    const storyId = generateId('story');
    const importedScenes = normalizeImportedSceneRecords(storyId, rawScenes as Record<string, SceneRecord>);
    const metadata: StoryMetadata = {
      id: storyId,
      title: typeof raw.title === 'string' ? raw.title : 'Imported Story',
      description: typeof raw.description === 'string' ? raw.description : '',
      author: typeof raw.author === 'string' ? raw.author : '',
      startSceneId: typeof raw.startSceneId === 'string' ? raw.startSceneId : Object.keys(importedScenes)[0] ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
      thumbnailUri: typeof raw.thumbnailUri === 'string' ? raw.thumbnailUri : undefined,
      sceneCount: Object.keys(importedScenes).length,
    };

    useAppStore.setState((state) => ({
      storiesMetadata: [...state.storiesMetadata, metadata],
      sceneRecordsByStory: {
        ...state.sceneRecordsByStory,
        [storyId]: importedScenes,
      },
    }));

    return buildCanonicalStory(metadata, importedScenes);
  }

  const story = StoryValidator.validateStory(raw);
  story.id = generateId('story');
  story.createdAt = Date.now();
  story.updatedAt = Date.now();

  const importedScenes = buildCanonicalSceneRecordsFromLegacyScenes(
    story.id,
    story.scenes || {},
    story.startSceneId,
  );
  const metadata: StoryMetadata = {
    id: story.id,
    title: story.title,
    description: story.description ?? '',
    author: story.author ?? '',
    startSceneId: story.startSceneId || (Object.keys(importedScenes)[0] ?? ''),
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    thumbnailUri: story.thumbnailUri,
    sceneCount: Object.keys(importedScenes).length,
  };

  useAppStore.setState((state) => ({
    storiesMetadata: [...state.storiesMetadata, metadata],
    sceneRecordsByStory: {
      ...state.sceneRecordsByStory,
      [story.id]: importedScenes,
    },
  }));

  return buildCanonicalStory(metadata, importedScenes);
}

// ── Auto-save component ──

export function StoryAutoSave() {
  const playbackState = useAppStore((s) => s.playbackState);
  const syncAutoSave = useAppStore((s) => s.syncAutoSave);

  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);

  useAutoSave({
    playbackState,
    runtimeSnapshot: { storiesMetadata, sceneRecordsByStory },
    onAutoSave: async (newSlot) => { syncAutoSave(newSlot); },
    enabled: !!playbackState?.isPlaying,
  });

  return null;
}

// ── State selector hook ──

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
  const currentStory = currentMetadata
    ? buildCanonicalStory(currentMetadata, sceneRecordsByStory[currentMetadata.id] || {})
    : null;
  const stories = storiesMetadata.map((metadata) =>
    buildCanonicalStory(metadata, sceneRecordsByStory[metadata.id] || {}),
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

// ── Actions hook ──

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
