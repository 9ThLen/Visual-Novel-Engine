// use-app-store.ts — persisted global store for the Visual Novel Engine
//
// Splits: use-lego-store.ts for Lego editor state, theme-store.ts for theme
//
// State slices:
//   storiesMetadata, sceneRecordsByStory, currentStoryId, playbackState,
//   saveSlots, settings, audioLibraries, characterLibraries,
//   language, mediaLibrary, isLoaded

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createPersistentStorage } from '@/lib/persistent-storage';
import type { Language } from '@/lib/translations';
import type { Story } from '@/lib/scene-operations';
import type { UserSettings } from '@/lib/user-settings';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { SaveSlot } from '@/lib/story-domain';
import type { SceneRecord, SceneConnection } from '@/lib/engine/types';
import {
  getCanonicalSceneRecordFromState,
  getCanonicalSceneRecordsForStoryFromState,
  updateSceneRecordPreservingMeta,
  type SceneRecordContentUpdates,
} from '@/lib/scene-operations';
import { StoryDomain, type StoryMetadata } from '@/lib/story-domain';
import { buildCanonicalLoadSnapshot, buildCanonicalSaveSlot } from '@/lib/reader-runtime';
import { toReaderSceneMap } from '@/lib/reader-scene';
import {
  applyCanonicalSceneDelete,
  buildCanonicalSceneRecordsFromLegacyScenes,
  createCanonicalStorySeed,
  removeCanonicalConnection,
  replaceConnectionByOutputPort,
  syncCanonicalStartScene,
} from '@/lib/scene-operations';
import type { Character } from '@/lib/character-types';
import {
  CHARACTER_AUTHORING_SCHEMA_VERSION,
  migrateCharacterLibraries,
  migrateCharacterLibrary,
} from '@/lib/character-migration';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { AudioLibraryItem } from '@/lib/audio-types';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { generateId } from '@/lib/id-utils';
import { defaultUserSettings, normalizeUserSettings } from '@/lib/user-settings';

function hasSceneRecords(records: Record<string, SceneRecord> | undefined): boolean {
  return Object.keys(records || {}).length > 0;
}

function mergeSceneRecordsByStory(
  currentSceneRecords: Record<string, Record<string, SceneRecord>>,
  importedSceneRecords: Record<string, Record<string, SceneRecord>>
): Record<string, Record<string, SceneRecord>> {
  const storyIds = new Set([
    ...Object.keys(currentSceneRecords),
    ...Object.keys(importedSceneRecords),
  ]);

  return Object.fromEntries(
    [...storyIds].map((storyId) => {
      const imported = importedSceneRecords[storyId];
      const current = currentSceneRecords[storyId];

      if (hasSceneRecords(imported)) return [storyId, imported] as const;
      return [storyId, current || imported || {}] as const;
    })
  );
}


// ── Store shape ─────────────────────────────────────────────────────────────

function getPersistableMediaLibrary(assets: unknown): LibraryAsset[] {
  if (!Array.isArray(assets)) return [];

  return assets.filter((asset): asset is LibraryAsset => {
    if (!asset || typeof asset !== 'object') return false;
    const candidate = asset as Partial<LibraryAsset>;
    return typeof candidate.uri === 'string' && !candidate.uri.startsWith('data:');
  });
}

export interface AppState {
  storiesMetadata: StoryMetadata[];
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
  migrationError: string | null;
}

export interface AppActions {
  migrateFromLegacyKeys: () => Promise<void>;
  clearMigrationError: () => void;
  loadCurrentStory: (storyId: string | null) => Promise<void>;
  updatePlaybackState: (state: PlaybackState | null) => void;
  saveGame: (slotId: string) => void;
  loadGame: (slotId: string) => { storyId: string; playbackState: PlaybackState } | null;
  deleteSaveSlot: (slotId: string) => void;
  syncAutoSave: (newSlot: SaveSlot) => void;
  updateSettings: (partial: Partial<UserSettings>) => void;
  createStory: (title: string) => { storyId: string; sceneId: string };
  /** @deprecated Import stories through importStory(), which canonicalizes legacy Story data. */
  addStory: (story: Story) => void;
  deleteStory: (storyId: string) => void;
  updateStoryMetadata: (storyId: string, updates: Partial<StoryMetadata>) => void;
  deleteScene: (storyId: string, sceneId: string) => void;
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
      migrationError: null,

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
          const language: Language = (['en', 'uk'] as Language[]).includes(langJson as Language)
            ? (langJson as Language)
            : 'en';

          let characterLibraries: Record<string, Character[]> = {};
          try {
            const oldCharLibJson = await storage.getItem(STORAGE_KEYS.CHARACTER_LIBRARY);
            if (oldCharLibJson) {
              const parsed = JSON.parse(oldCharLibJson);
              if (parsed.characters) {
                characterLibraries['default'] = migrateCharacterLibrary(parsed.characters);
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
                    return [s.id, migrateCharacterLibrary(lib.characters || lib)] as const;
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

          let sceneRecordsByStory: Record<string, Record<string, SceneRecord>> = {};
          if (stories.length > 0) {
            const sceneEntries = await Promise.all(
              stories.map(async (s) => {
                const json = await storage.getItem(STORAGE_KEYS.SCENES(s.id));
                return [s.id, json ? JSON.parse(json) : {}] as const;
              })
            );
            const legacyScenesByStory = Object.fromEntries(sceneEntries);
            sceneRecordsByStory = Object.fromEntries(
              stories.map((story) => [
                story.id,
                buildCanonicalSceneRecordsFromLegacyScenes(
                  story.id,
                  legacyScenesByStory[story.id] || {},
                  story.startSceneId
                ),
              ])
            );
          }

          // Merge with existing state — don't overwrite what persist already hydrated
          const current = get();
          const mergedSceneRecordsByStory = mergeSceneRecordsByStory(
            current.sceneRecordsByStory,
            sceneRecordsByStory
          );
          set({
            storiesMetadata: stories.length > 0 && current.storiesMetadata.length === 0 ? stories : current.storiesMetadata,
            sceneRecordsByStory: mergedSceneRecordsByStory,
            saveSlots: saveSlots.length > 0 && current.saveSlots.length === 0 ? saveSlots : current.saveSlots,
            settings: normalizeUserSettings(settings ?? current.settings),
            characterLibraries: Object.keys(characterLibraries).length > 0
              ? migrateCharacterLibraries({
                  ...current.characterLibraries,
                  ...characterLibraries,
                })
              : migrateCharacterLibraries(current.characterLibraries),
            language,
            isLoaded: true,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown migration error';
          ErrorHandler.handle('AppStore migration failed', e, ErrorCategory.STORAGE);
          set({ isLoaded: true, migrationError: message });
        }
      },

      clearMigrationError: () => set({ migrationError: null }),

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
        const newSlot = buildCanonicalSaveSlot(
          slotId,
          {
            storiesMetadata: state.storiesMetadata,
            sceneRecordsByStory: toReaderSceneMap(state.sceneRecordsByStory),
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

        return buildCanonicalLoadSnapshot(
          {
            storiesMetadata: state.storiesMetadata,
            sceneRecordsByStory: toReaderSceneMap(state.sceneRecordsByStory),
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
            sceneRecordsByStory: {
              ...s.sceneRecordsByStory,
              [story.id]: canonicalRecords,
            },
          };
        }),

      deleteStory: (storyId) =>
        set((s) => {
          const { [storyId]: __, ...recordRest } = s.sceneRecordsByStory;
          return {
            storiesMetadata: s.storiesMetadata.filter((m) => m.id !== storyId),
            sceneRecordsByStory: recordRest,
          };
        }),

      updateStoryMetadata: (storyId, updates) =>
        set((s) => ({
          storiesMetadata: s.storiesMetadata.map((m) =>
            m.id === storyId ? { ...m, ...updates, updatedAt: Date.now() } : m
          ),
        })),

      deleteScene: (storyId, sceneId) =>
        set((s) => applyCanonicalSceneDelete(s, storyId, sceneId)),

      setLanguage: (lang) => set({ language: lang }),

      setCharacterLibrary: (storyId, characters) =>
        set((s) => ({
          characterLibraries: {
            ...s.characterLibraries,
            [storyId]: migrateCharacterLibrary(characters as Character[]),
          },
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
          storyRecords[fromSceneId] = {
            ...fromScene,
            connections: replaceConnectionByOutputPort(fromScene.connections || [], connection),
            updatedAt: Date.now(),
          };
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
          const orderedSceneIds = [
            ...sceneIds.filter((id) => storyRecords[id]),
            ...Object.keys(storyRecords).filter((id) => !sceneIds.includes(id)),
          ];
          return {
            storiesMetadata: s.storiesMetadata.map((metadata) =>
              metadata.id === storyId
                ? { ...metadata, sceneOrder: orderedSceneIds, updatedAt: Date.now() }
                : metadata
            ),
          };
        }),
    }),
    {
      name: 'vne_app_state',
      storage: createJSONStorage(createPersistentStorage),
      partialize: (state) => ({
        storiesMetadata: state.storiesMetadata,
        sceneRecordsByStory: state.sceneRecordsByStory,
        currentStoryId: state.currentStoryId,
        playbackState: state.playbackState,
        settings: state.settings,
        saveSlots: state.saveSlots,
        audioLibraries: state.audioLibraries,
        characterLibraries: state.characterLibraries,
        language: state.language,
        mediaLibrary: getPersistableMediaLibrary(state.mediaLibrary),
      }),
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return currentState;
        }

        const persisted = persistedState as Partial<AppState>;
        return {
          ...currentState,
          ...persisted,
          mediaLibrary: getPersistableMediaLibrary(persisted.mediaLibrary),
          characterLibraries: migrateCharacterLibraries(persisted.characterLibraries),
          storiesMetadata: (persisted.storiesMetadata ?? currentState.storiesMetadata).map((story) => ({
            ...story,
            characterAuthoringSchemaVersion:
              story.characterAuthoringSchemaVersion ?? CHARACTER_AUTHORING_SCHEMA_VERSION,
          })),
        };
      },
      onRehydrateStorage: __DEV__
        ? () => {
            return (state, error) => {
              if (error) {
                console.warn('[Persist] hydration error:', error);
              }
              if (state) {
                console.log(`[Persist] hydrated ${state.storiesMetadata.length} stories`);
              }
            };
          }
        : undefined,
    }
  )
);

export const selectStoryMetadata = (storyId: string) => (state: AppState) =>
  state.storiesMetadata.find((m) => m.id === storyId);
export const selectCanonicalSceneRecord = (storyId: string, sceneId: string) => (state: AppState) =>
  getCanonicalSceneRecordFromState(state, storyId, sceneId);
export const selectSceneRecordsForStory = (storyId: string) => (state: AppState) =>
  getCanonicalSceneRecordsForStoryFromState(state, storyId);

export type MediaLibraryAsset = LibraryAsset;
