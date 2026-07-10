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
import { createAppStoreStorage } from '@/lib/app-store-storage';
import type { SceneRecord } from '@/lib/engine/types';
import {
  getSceneRecordMapForStoryFromAccess,
  getSceneRecordFromAccess,
  getSceneRecordsForStoryFromAccess,
  getStoryMetadataFromAccess,
} from '@/lib/scene-access';
import type { Language } from '@/lib/translations';
import { type SaveSlot, type StoryMetadata } from '@/lib/story-domain';
import {
  buildCanonicalSceneRecordsFromLegacyScenes,
  resolveCanonicalStartSceneId,
} from '@/lib/scene-operations';
import { toReaderScene } from '@/lib/reader-scene';
import type { Character } from '@/lib/character-types';
import {
  migrateCharacterLibraries,
  migrateCharacterLibrary,
} from '@/lib/character-migration';
import { migrateStoryImageAssetIds } from '@/lib/story-image-library';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';
import { normalizeUserSettings, type UserSettings } from '@/lib/user-settings';
import {
  APP_STORE_PERSIST_VERSION,
  buildPersistedAppState,
  mergePersistedAppState,
  migratePersistedAppState,
} from '@/lib/app-store-persistence';
import { initialAppState } from '@/stores/app-store-initial-state';
import {
  type AppState,
  type AppStore,
} from '@/stores/app-store-types';
import { createLibrariesSlice } from '@/stores/app-store-slices/libraries-slice';
import { createPlaybackSlice } from '@/stores/app-store-slices/playback-slice';
import { createPreferencesSlice } from '@/stores/app-store-slices/preferences-slice';
import { createSavesSlice } from '@/stores/app-store-slices/saves-slice';
import { createSceneSlice } from '@/stores/app-store-slices/scene-slice';
import { createSnapshotsSlice } from '@/stores/app-store-slices/snapshots-slice';
import { createStorySlice } from '@/stores/app-store-slices/story-slice';

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

// ── Store ───────────────────────────────────────────────────────────────────

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ── Initial state ──
      ...initialAppState,

      // ── Actions ──

      ...createPlaybackSlice(set),
      ...createPreferencesSlice(set),
      ...createLibrariesSlice(set),
      ...createSavesSlice(set, get),
      ...createStorySlice(set),
      ...createSceneSlice(set, get),
      ...createSnapshotsSlice(set, get),

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
            imageAssetIdsByStory: migrateStoryImageAssetIds(
              current.imageAssetIdsByStory,
              mergedSceneRecordsByStory,
              current.mediaLibrary,
              Object.keys(current.imageAssetIdsByStory).length === 0,
            ),
            language,
            isLoaded: true,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown migration error';
          ErrorHandler.handle('AppStore migration failed', e, ErrorCategory.STORAGE);
          set({ isLoaded: true, migrationError: message });
        }
      },

    }),
    {
      name: STORAGE_KEYS.APP_STATE,
      version: APP_STORE_PERSIST_VERSION,
      storage: createJSONStorage(createAppStoreStorage),
      migrate: (persistedState, fromVersion) =>
        migratePersistedAppState(persistedState, fromVersion),
      partialize: (state) => buildPersistedAppState(state),
      merge: (persistedState, currentState) => mergePersistedAppState(persistedState, currentState),
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
  getStoryMetadataFromAccess(state, storyId);
export const selectCanonicalSceneRecord = (storyId: string, sceneId: string) => (state: AppState) =>
  getSceneRecordFromAccess(state, storyId, sceneId);
export const selectReaderScene = (storyId: string, sceneId: string) => (state: AppState) => {
  const record = getSceneRecordFromAccess(state, storyId, sceneId);
  return record ? toReaderScene(record) : null;
};
export const selectReaderStartSceneId =
  (storyId: string, fallbackSceneId: string | null | undefined) => (state: AppState) =>
    resolveCanonicalStartSceneId(state, storyId, fallbackSceneId) || fallbackSceneId;
export const selectSceneRecordMapForStory = (storyId: string) => (state: AppState) =>
  getSceneRecordMapForStoryFromAccess(state, storyId);
export const selectSceneRecordsForStory = (storyId: string) => (state: AppState) =>
  getSceneRecordsForStoryFromAccess(state, storyId);

export type { AppActions, AppState, MediaLibraryAsset } from '@/stores/app-store-types';
