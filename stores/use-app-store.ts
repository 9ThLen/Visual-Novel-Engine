// use-app-store.ts — persisted global store for the Visual Novel Engine
//
// Splits: use-lego-store.ts for Lego editor state, theme-store.ts for theme
//
// State slices:
//   storiesMetadata, scenesByStory, currentStoryId, playbackState,
//   saveSlots, settings, audioLibraries, characterLibraries,
//   language, mediaLibrary, isLoaded

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createPersistentStorage } from '@/lib/persistent-storage';
import type { Language } from '@/lib/translations';
import type { StoryMetadata } from '@/lib/story-domain';
import type { StoryScene, SaveSlot, PlaybackState, Story, UserSettings } from '@/lib/types';
import type { SceneRecord, SceneConnection } from '@/lib/engine/types';
import {
  buildCompatibilitySceneMapFromState,
  getCanonicalSceneRecordFromState,
  getCanonicalSceneRecordsForStoryFromState,
  updateSceneRecordPreservingMeta,
} from '@/lib/canonical-scene';
import type { SceneRecordContentUpdates } from '@/lib/canonical-scene';
import { StoryDomain } from '@/lib/story-domain';
import { buildRuntimeLoadSnapshot, buildRuntimeSaveSlot } from '@/lib/runtime-story';
import {
  applyCanonicalSceneDelete,
  buildCanonicalSceneRecordsFromLegacyScenes,
  createCanonicalStorySeed,
  removeCanonicalConnection,
  syncCanonicalStartScene,
} from '@/lib/scene-operations';
import type { Character } from '@/lib/character-types';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { AudioLibraryItem } from '@/lib/audio-types';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { generateId } from '@/lib/id-utils';
import { defaultUserSettings, normalizeUserSettings } from '@/lib/user-settings';

import type { Choice } from '@/lib/types';

// ── Store shape ─────────────────────────────────────────────────────────────

export interface AppState {
  storiesMetadata: StoryMetadata[];
  scenesByStory: Record<string, Record<string, StoryScene>>;
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  currentStoryId: string | null;
  playbackState: PlaybackState | null;
  settings: UserSettings;
  saveSlots: SaveSlot[];
  audioLibraries: Record<string, AudioLibraryItem[]>;
  characterLibraries: Record<string, Character[]>;
  language: Language;
  mediaLibrary: LibraryAsset[];
  isLoaded: boolean;
}

export interface AppActions {
  migrateFromLegacyKeys: () => Promise<void>;
  loadCurrentStory: (storyId: string | null) => Promise<void>;
  updatePlaybackState: (state: PlaybackState | null) => void;
  saveGame: (slotId: string) => void;
  loadGame: (slotId: string) => { story: Story; playbackState: PlaybackState } | null;
  deleteSaveSlot: (slotId: string) => void;
  syncAutoSave: (newSlot: SaveSlot) => void;
  updateSettings: (partial: Partial<UserSettings>) => void;
  createStory: (title: string) => { storyId: string; sceneId: string };
  addStory: (story: Story) => void;
  deleteStory: (storyId: string) => void;
  updateStoryMetadata: (storyId: string, updates: Partial<StoryMetadata>) => void;
  saveScene: (storyId: string, scene: StoryScene) => void;
  deleteScene: (storyId: string, sceneId: string) => void;
  addChoice: (storyId: string, sceneId: string, choice: Choice) => void;
  deleteChoice: (storyId: string, sceneId: string, choiceId: string) => void;
  setLanguage: (lang: Language) => void;
  setCharacterLibrary: (storyId: string, characters: Character[]) => void;
  setAudioLibrary: (storyId: string, items: AudioLibraryItem[]) => void;
  setMediaLibrary: (assets: LibraryAsset[]) => void;

  // Scene record operations (new timeline-based scenes)
  saveSceneRecord: (record: SceneRecord) => void;
  updateSceneRecordPreservingMeta: (
    storyId: string,
    sceneId: string,
    updates: SceneRecordContentUpdates
  ) => void;
  getScenesForStory: (storyId: string) => SceneRecord[];
  updateSceneConnection: (storyId: string, fromSceneId: string, connection: SceneConnection) => void;
  removeSceneConnection: (
    storyId: string,
    fromSceneId: string,
    targetSceneId: string,
    outputPort?: string
  ) => void;
  deleteSceneRecord: (storyId: string, sceneId: string) => void;
  setStartScene: (storyId: string, sceneId: string) => void;
  reorderScenes: (storyId: string, sceneIds: string[]) => void;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      // ── Initial state ──
      storiesMetadata: [],
      scenesByStory: {},
      sceneRecordsByStory: {},
      currentStoryId: null,
      playbackState: null,
      settings: defaultUserSettings,
      saveSlots: [],
      audioLibraries: {},
      characterLibraries: {},
      language: 'en',
      mediaLibrary: [],
      isLoaded: false,

      // ── Actions ──

      migrateFromLegacyKeys: async () => {
        try {
          const storage = createPersistentStorage();
          const TIMEOUT_MS = 10_000;
          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('migrateFromLegacyKeys timed out')), TIMEOUT_MS)
);

          const [storiesJson, saveSlotsJson, settingsJson, blockTreeJson, langJson] =
            await Promise.race([
              Promise.all([
                storage.getItem(STORAGE_KEYS.STORIES),
                storage.getItem(STORAGE_KEYS.SAVE_SLOTS),
                storage.getItem(STORAGE_KEYS.SETTINGS),
                storage.getItem(STORAGE_KEYS.BLOCK_TREE),
                storage.getItem('app_language'),
              ]),
              timeoutPromise,
            ]) as [string | null, string | null, string | null, string | null, string | null];

          const stories: StoryMetadata[] = storiesJson ? JSON.parse(storiesJson) : [];
          const saveSlots: SaveSlot[] = saveSlotsJson ? JSON.parse(saveSlotsJson) : [];
          const settings: UserSettings | null = settingsJson ? JSON.parse(settingsJson) : null;
          const language: Language = (['en', 'uk', 'pl'] as Language[]).includes(langJson as Language)
            ? (langJson as Language)
            : 'en';

          let characterLibraries: Record<string, Character[]> = {};
          try {
            const oldCharLibJson = await storage.getItem(STORAGE_KEYS.CHARACTER_LIBRARY);
            if (oldCharLibJson) {
              const parsed = JSON.parse(oldCharLibJson);
              if (parsed.characters) {
                characterLibraries['default'] = parsed.characters;
              }
            }
          } catch { }
          if (stories.length > 0) {
            const charEntries = await Promise.all(
              stories.map(async (s) => {
                try {
                  const json = await storage.getItem(`character_library_${s.id}`);
                  if (json) {
                    const lib = JSON.parse(json);
                    return [s.id, lib.characters || lib] as const;
                  }
                } catch { }
                return [s.id, [] as Character[]] as const;
              })
            );
            for (const [id, chars] of charEntries) {
              if (Array.isArray(chars) && chars.length > 0) {
                characterLibraries[id] = chars;
              }
            }
          }

          let scenesByStory: Record<string, Record<string, StoryScene>> = {};
          let sceneRecordsByStory: Record<string, Record<string, SceneRecord>> = {};
          if (stories.length > 0) {
            const sceneEntries = await Promise.all(
              stories.map(async (s) => {
                const json = await storage.getItem(STORAGE_KEYS.SCENES(s.id));
                return [s.id, json ? JSON.parse(json) : {}] as const;
              })
            );
            scenesByStory = Object.fromEntries(sceneEntries);
            sceneRecordsByStory = Object.fromEntries(
              stories.map((story) => [
                story.id,
                buildCanonicalSceneRecordsFromLegacyScenes(
                  story.id,
                  scenesByStory[story.id] || {},
                  story.startSceneId
                ),
              ])
            );
          }

          // Merge with existing state — don't overwrite what persist already hydrated
          const current = get();
          set({
            storiesMetadata: stories.length > 0 ? stories : current.storiesMetadata,
            scenesByStory: Object.keys(scenesByStory).length > 0 ? scenesByStory : current.scenesByStory,
            sceneRecordsByStory:
              Object.keys(sceneRecordsByStory).length > 0 ? sceneRecordsByStory : current.sceneRecordsByStory,
            saveSlots: saveSlots.length > 0 ? saveSlots : current.saveSlots,
            settings: normalizeUserSettings(settings ?? current.settings),
            characterLibraries: Object.keys(characterLibraries).length > 0 ? characterLibraries : current.characterLibraries,
            language,
            isLoaded: true,
          });
        } catch (e) {
          ErrorHandler.handle('AppStore migration failed', e, ErrorCategory.STORAGE);
          set({ isLoaded: true });
        }
      },

      loadCurrentStory: async (storyId) => {
        if (!storyId) {
          set({ currentStoryId: null, playbackState: null });
          return;
        }
        set({ currentStoryId: storyId });
      },

      updatePlaybackState: (state) => set({ playbackState: state }),

      saveGame: (slotId) => {
        const state = get();
        if (!state.playbackState || !state.currentStoryId) return;
        const newSlot = buildRuntimeSaveSlot(
          slotId,
          {
            storiesMetadata: state.storiesMetadata,
            scenesByStory: state.scenesByStory,
            sceneRecordsByStory: state.sceneRecordsByStory,
          },
          state.playbackState
        );
        if (!newSlot) return;

        set((s) => ({ saveSlots: [...s.saveSlots.filter((x) => x.id !== slotId), newSlot] }));
      },

      loadGame: (slotId) => {
        const state = get();
        const slot = state.saveSlots.find((s) => s.id === slotId);
        if (!slot) return null;

        return buildRuntimeLoadSnapshot(
          {
            storiesMetadata: state.storiesMetadata,
            scenesByStory: state.scenesByStory,
            sceneRecordsByStory: state.sceneRecordsByStory,
          },
          slot
        );
      },

      deleteSaveSlot: (slotId) =>
        set((s) => ({ saveSlots: s.saveSlots.filter((slot) => slot.id !== slotId) })),

      syncAutoSave: (newSlot) =>
        set((s) => ({
          saveSlots: [...s.saveSlots.filter((sl) => sl.id !== 'autosave'), newSlot],
        })),

      updateSettings: (partial) =>
        set((s) => ({ settings: normalizeUserSettings({ ...s.settings, ...partial }) })),

      createStory: (title) => {
        const storyId = generateId('story');
        const sceneId = 'scene_1';
        const seed = createCanonicalStorySeed(title, { storyId, sceneId });
        set((s) => ({
          storiesMetadata: [...s.storiesMetadata.filter((m) => m.id !== storyId), seed.metadata],
          sceneRecordsByStory: {
            ...s.sceneRecordsByStory,
            [storyId]: {
              [sceneId]: seed.sceneRecord,
            },
          },
        }));
        return { storyId, sceneId };
      },

      addStory: (story) =>
        set((s) => {
          const metadata = StoryDomain.extractMetadata(story);
          const canonicalRecords = buildCanonicalSceneRecordsFromLegacyScenes(
            story.id,
            story.scenes || {},
            story.startSceneId
          );
          const exists = s.storiesMetadata.find((m) => m.id === story.id);
          return {
            storiesMetadata: exists
              ? s.storiesMetadata.map((m) => (m.id === story.id ? metadata : m))
              : [...s.storiesMetadata, metadata],
            scenesByStory: { ...s.scenesByStory, [story.id]: story.scenes },
            sceneRecordsByStory: {
              ...s.sceneRecordsByStory,
              [story.id]: canonicalRecords,
            },
          };
        }),

      deleteStory: (storyId) =>
        set((s) => {
          const { [storyId]: _, ...rest } = s.scenesByStory;
          const { [storyId]: __, ...recordRest } = s.sceneRecordsByStory;
          return {
            storiesMetadata: s.storiesMetadata.filter((m) => m.id !== storyId),
            scenesByStory: rest,
            sceneRecordsByStory: recordRest,
          };
        }),

      updateStoryMetadata: (storyId, updates) =>
        set((s) => ({
          storiesMetadata: s.storiesMetadata.map((m) =>
            m.id === storyId ? { ...m, ...updates, updatedAt: Date.now() } : m
          ),
        })),

      saveScene: (storyId, scene) =>
        set((s) => ({
          scenesByStory: {
            ...s.scenesByStory,
            [storyId]: {
              ...(s.scenesByStory[storyId] || {}),
              [scene.id]: scene,
            },
          },
          storiesMetadata: s.storiesMetadata.map((m) =>
            m.id === storyId ? { ...m, updatedAt: Date.now() } : m
          ),
        })),

      deleteScene: (storyId, sceneId) =>
        set((s) => {
          const storyScenes = { ...(s.scenesByStory[storyId] || {}) };
          delete storyScenes[sceneId];
          return {
            scenesByStory: { ...s.scenesByStory, [storyId]: storyScenes },
            storiesMetadata: s.storiesMetadata.map((m) =>
              m.id === storyId
                ? { ...m, updatedAt: Date.now(), sceneCount: Object.keys(storyScenes).length }
                : m
            ),
          };
        }),

      addChoice: (storyId, sceneId, choice) =>
        set((s) => {
          const storyScenes = { ...(s.scenesByStory[storyId] || {}) };
          const scene = storyScenes[sceneId];
          if (!scene) return {};
          storyScenes[sceneId] = { ...scene, choices: [...scene.choices, choice] };
          return {
            scenesByStory: { ...s.scenesByStory, [storyId]: storyScenes },
            storiesMetadata: s.storiesMetadata.map((m) =>
              m.id === storyId ? { ...m, updatedAt: Date.now() } : m
            ),
          };
        }),

      deleteChoice: (storyId, sceneId, choiceId) =>
        set((s) => {
          const storyScenes = { ...(s.scenesByStory[storyId] || {}) };
          const scene = storyScenes[sceneId];
          if (!scene) return {};
          storyScenes[sceneId] = { ...scene, choices: scene.choices.filter((c) => c.id !== choiceId) };
          return {
            scenesByStory: { ...s.scenesByStory, [storyId]: storyScenes },
            storiesMetadata: s.storiesMetadata.map((m) =>
              m.id === storyId ? { ...m, updatedAt: Date.now() } : m
            ),
          };
        }),

      setLanguage: (lang) => set({ language: lang }),

      setCharacterLibrary: (storyId, characters) =>
        set((s) => ({
          characterLibraries: { ...s.characterLibraries, [storyId]: characters as Character[] },
        })),

      setAudioLibrary: (storyId, items) =>
        set((s) => ({
          audioLibraries: { ...s.audioLibraries, [storyId]: items },
        })),

      setMediaLibrary: (assets) => set({ mediaLibrary: assets }),

      // ── Scene Record operations (timeline-based scenes) ──

      saveSceneRecord: (record) =>
        set((s) => {
          const storyRecords = { ...(s.sceneRecordsByStory[record.storyId] || {}) };
          storyRecords[record.id] = { ...record, updatedAt: Date.now() };

          return syncCanonicalStartScene(s, record.storyId, {
            sceneRecords: storyRecords,
            preferredStartSceneId: record.isStart ? record.id : undefined,
          });
        }),

      updateSceneRecordPreservingMeta: (storyId, sceneId, updates) =>
        set((s) => {
          const existingRecord = getCanonicalSceneRecordFromState(s, storyId, sceneId);
          if (!existingRecord) {
            return {};
          }

          const storyRecords = { ...(s.sceneRecordsByStory[storyId] || {}) };
          storyRecords[sceneId] = updateSceneRecordPreservingMeta(existingRecord, updates);

          return {
            sceneRecordsByStory: { ...s.sceneRecordsByStory, [storyId]: storyRecords },
            storiesMetadata: s.storiesMetadata.map((m) =>
              m.id === storyId ? { ...m, updatedAt: Date.now() } : m
            ),
          };
        }),

      getScenesForStory: (storyId) => {
        return getCanonicalSceneRecordsForStoryFromState(get(), storyId);
      },

      updateSceneConnection: (storyId, fromSceneId, connection) =>
        set((s) => {
          const storyRecords = { ...(s.sceneRecordsByStory[storyId] || {}) };
          const fromScene = storyRecords[fromSceneId];
          if (!fromScene) return {};
          const existing = fromScene.connections || [];
          const filtered = existing.filter(
            (c) => !(c.targetSceneId === connection.targetSceneId && c.outputPort === connection.outputPort)
          );
          storyRecords[fromSceneId] = { ...fromScene, connections: [...filtered, connection], updatedAt: Date.now() };
          return { sceneRecordsByStory: { ...s.sceneRecordsByStory, [storyId]: storyRecords } };
        }),

      removeSceneConnection: (storyId, fromSceneId, targetSceneId, outputPort) =>
        set((s) => removeCanonicalConnection(s, storyId, fromSceneId, targetSceneId, outputPort)),

      deleteSceneRecord: (storyId, sceneId) =>
        set((s) => applyCanonicalSceneDelete(s, storyId, sceneId)),

      setStartScene: (storyId, sceneId) =>
        set((s) => syncCanonicalStartScene(s, storyId, { preferredStartSceneId: sceneId })),

      reorderScenes: (storyId, sceneIds) =>
        set((s) => {
          const storyRecords = { ...(s.sceneRecordsByStory[storyId] || {}) };
          sceneIds.forEach((id, index) => {
            if (storyRecords[id]) {
              storyRecords[id] = { ...storyRecords[id], updatedAt: Date.now() };
            }
          });
          return { sceneRecordsByStory: { ...s.sceneRecordsByStory, [storyId]: storyRecords } };
        }),
    }),
    {
      name: 'vne_app_state',
      storage: createJSONStorage(createPersistentStorage),
      partialize: (state) => ({
        storiesMetadata: state.storiesMetadata,
        scenesByStory: state.scenesByStory,
        sceneRecordsByStory: state.sceneRecordsByStory,
        currentStoryId: state.currentStoryId,
        playbackState: state.playbackState,
        settings: state.settings,
        saveSlots: state.saveSlots,
        audioLibraries: state.audioLibraries,
        characterLibraries: state.characterLibraries,
        language: state.language,
        mediaLibrary: state.mediaLibrary,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error && __DEV__) {
            console.warn('[Persist] hydration error:', error);
          }
          if (__DEV__ && state) {
            console.log(`[Persist] hydrated ${state.storiesMetadata.length} stories`);
          }
        };
      },
    }
  )
);

export const selectStoryScenes = (storyId: string) => (state: AppState) =>
  buildCompatibilitySceneMapFromState(state, storyId);
export const selectStoryMetadata = (storyId: string) => (state: AppState) =>
  state.storiesMetadata.find((m) => m.id === storyId);
export const selectCanonicalSceneRecord = (storyId: string, sceneId: string) => (state: AppState) =>
  getCanonicalSceneRecordFromState(state, storyId, sceneId);
export const selectSceneRecordsForStory = (storyId: string) => (state: AppState) =>
  getCanonicalSceneRecordsForStoryFromState(state, storyId);

export type MediaLibraryAsset = LibraryAsset;
