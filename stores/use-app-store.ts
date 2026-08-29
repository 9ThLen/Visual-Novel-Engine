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
import { migrateStoryMediaAssetIds } from '@/lib/story-media-library';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '@/lib/error-handler';
import { mergeLegacyUserSettings, normalizeUserSettings, type UserSettings } from '@/lib/user-settings';
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
import { createReleasesSlice } from '@/stores/app-store-slices/releases-slice';
import { createSnapshotsSlice } from '@/stores/app-store-slices/snapshots-slice';
import { createStorySlice } from '@/stores/app-store-slices/story-slice';

function hasSceneRecords(records: Record<string, SceneRecord> | undefined): boolean {
  return Object.keys(records || {}).length > 0;
}

function mergeSceneRecordsByStory(
  currentSceneRecords: Record<string, Record<string, SceneRecord>>,
  importedSceneRecords: Record<string, Record<string, SceneRecord>>,
  currentHydration: Record<string, 'full' | 'window'>,
): Record<string, Record<string, SceneRecord>> {
  const storyIds = new Set([
    ...Object.keys(currentSceneRecords),
    ...Object.keys(importedSceneRecords),
  ]);

  return Object.fromEntries(
    [...storyIds].map((storyId) => {
      const imported = importedSceneRecords[storyId];
      const current = currentSceneRecords[storyId];

      if (currentHydration[storyId] === 'full') return [storyId, current || {}] as const;

      // Legacy data may still be present after the canonical store has been
      // edited. It can fill missing scenes, but it must never replace a newer
      // hydrated scene with the same id.
      if (hasSceneRecords(imported)) return [storyId, { ...imported, ...(current || {}) }] as const;
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
      ...createReleasesSlice(set),

      migrateFromLegacyKeys: async () => {
        try {
          const storage = createPersistentStorage();
          const canonicalStorage = createAppStoreStorage();
          const TIMEOUT_MS = 10_000;
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('migrateFromLegacyKeys timed out')), TIMEOUT_MS);
          });

          let legacyValues: [string | null, string | null, string | null, string | null, string | null, string | null];
          try {
            legacyValues = await Promise.race([
              Promise.all([
                storage.getItem(STORAGE_KEYS.STORIES),
                storage.getItem(STORAGE_KEYS.SAVE_SLOTS),
                storage.getItem(STORAGE_KEYS.SETTINGS),
                storage.getItem(STORAGE_KEYS.BLOCK_TREE),
                storage.getItem('app_language'),
                canonicalStorage.getItem(STORAGE_KEYS.APP_STATE),
              ]),
              timeoutPromise,
            ]);
          } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId);
          }
          const [storiesJson, saveSlotsJson, settingsJson, blockTreeJson, langJson, canonicalStateJson] = legacyValues;
          const hasCanonicalState = canonicalStateJson !== null;

          const stories: StoryMetadata[] = storiesJson ? JSON.parse(storiesJson) : [];
          const saveSlots: SaveSlot[] = saveSlotsJson ? JSON.parse(saveSlotsJson) : [];
          const settings: UserSettings | null = settingsJson ? JSON.parse(settingsJson) : null;
          const language: Language = (['en', 'uk'] as Language[]).includes(langJson as Language)
            ? (langJson as Language)
            : 'en';

          let characterLibraries: Record<string, Character[]> = {};
          let defaultCharacterMigrationFailed = false;
          let defaultCharacterKeyMigrated = false;
          const failedCharacterStoryIds = new Set<string>();
          try {
            const oldCharLibJson = await storage.getItem(STORAGE_KEYS.CHARACTER_LIBRARY);
            if (oldCharLibJson) {
              const parsed = JSON.parse(oldCharLibJson);
              defaultCharacterKeyMigrated = true;
              if (parsed.characters) {
                characterLibraries['default'] = migrateCharacterLibrary(parsed.characters);
              }
            }
          } catch (error) {
            defaultCharacterMigrationFailed = true;
            ErrorHandler.handle(
              'Legacy default character library migration failed',
              error,
              ErrorCategory.STORAGE,
              ErrorSeverity.LOW,
            );
          }
          if (stories.length > 0) {
            const charEntries = await Promise.all(
              stories.map(async (s) => {
                try {
                  const json = await storage.getItem(`character_library_${s.id}`);
                  if (json) {
                    const lib = JSON.parse(json);
                    return [s.id, migrateCharacterLibrary(lib.characters || lib)] as const;
                  }
                } catch (error) {
                  failedCharacterStoryIds.add(s.id);
                  ErrorHandler.handle(
                    'Legacy story character library migration failed',
                    error,
                    ErrorCategory.STORAGE,
                    ErrorSeverity.LOW,
                    { storyId: s.id },
                  );
                }
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
          const failedSceneStoryIds = new Set<string>();
          if (stories.length > 0) {
            const sceneEntries = await Promise.all(
              stories.map(async (s) => {
                try {
                  const json = await storage.getItem(STORAGE_KEYS.SCENES(s.id));
                  const legacyScenes = json ? JSON.parse(json) : {};
                  return [
                    s.id,
                    buildCanonicalSceneRecordsFromLegacyScenes(
                      s.id,
                      legacyScenes,
                      s.startSceneId,
                    ),
                  ] as const;
                } catch (error) {
                  failedSceneStoryIds.add(s.id);
                  ErrorHandler.handle(
                    'Legacy story scene migration failed',
                    error,
                    ErrorCategory.STORAGE,
                    ErrorSeverity.LOW,
                    { storyId: s.id },
                  );
                  return [s.id, null] as const;
                }
              })
            );
            sceneRecordsByStory = Object.fromEntries(
              sceneEntries.filter(
                (entry): entry is readonly [string, Record<string, SceneRecord>] => entry[1] !== null,
              ),
            );
          }

          const migratedSceneHydration = Object.fromEntries(
            Object.keys(sceneRecordsByStory).map((storyId) => [storyId, 'full' as const]),
          );
          // Derive from the latest store state atomically. Other bootstrap work
          // may update the store while the legacy reads above are in flight.
          set((current) => {
            const mergedSceneRecordsByStory = mergeSceneRecordsByStory(
              current.sceneRecordsByStory,
              sceneRecordsByStory,
              current.sceneRecordHydration,
            );
            const nextStoriesMetadata = stories.length > 0 && current.storiesMetadata.length === 0
              ? stories
              : current.storiesMetadata;
            const nextCharacterLibraries = Object.keys(characterLibraries).length > 0
              ? migrateCharacterLibraries({ ...characterLibraries, ...current.characterLibraries })
              : migrateCharacterLibraries(current.characterLibraries);
            const nextImageAssetIdsByStory = migrateStoryImageAssetIds(
              current.imageAssetIdsByStory,
              mergedSceneRecordsByStory,
              current.mediaLibrary,
              Object.keys(current.imageAssetIdsByStory).length === 0,
            );
            return {
              storiesMetadata: nextStoriesMetadata,
              sceneRecordsByStory: mergedSceneRecordsByStory,
            sceneRecordHydration: {
              ...current.sceneRecordHydration,
              ...migratedSceneHydration,
            },
            saveSlots: saveSlots.length > 0 && current.saveSlots.length === 0 ? saveSlots : current.saveSlots,
            settings: settings && !hasCanonicalState
              ? mergeLegacyUserSettings(settings, current.settings)
              : normalizeUserSettings(current.settings),
            characterLibraries: nextCharacterLibraries,
            imageAssetIdsByStory: nextImageAssetIdsByStory,
            mediaAssetIdsByStory: migrateStoryMediaAssetIds({
              current: current.mediaAssetIdsByStory,
              imageAssetIdsByStory: nextImageAssetIdsByStory,
              stories: nextStoriesMetadata,
              scenesByStory: mergedSceneRecordsByStory,
              characterLibraries: nextCharacterLibraries,
              audioLibraries: current.audioLibraries,
              mediaLibrary: current.mediaLibrary,
            }),
            language: hasCanonicalState ? current.language : language,
            isLoaded: true,
            migrationError: failedSceneStoryIds.size > 0
              ? `Could not migrate legacy scene data for: ${[...failedSceneStoryIds].join(', ')}`
              : null,
            };
          });

          if (storiesJson || saveSlotsJson || settingsJson || langJson || defaultCharacterKeyMigrated) {
            // Commit the canonical snapshot before retiring one-shot legacy
            // inputs. Failed story blobs stay in place for diagnosis/recovery.
            await persistAppStoreStateNow();
            await Promise.all(
              [
                ...stories
                  .filter((story) => !failedSceneStoryIds.has(story.id))
                  .map((story) => storage.removeItem(STORAGE_KEYS.SCENES(story.id))),
                ...stories
                  .filter((story) => !failedCharacterStoryIds.has(story.id))
                  .map((story) => storage.removeItem(`character_library_${story.id}`)),
                ...(saveSlotsJson ? [storage.removeItem(STORAGE_KEYS.SAVE_SLOTS)] : []),
                ...(settingsJson ? [storage.removeItem(STORAGE_KEYS.SETTINGS)] : []),
                ...(langJson ? [storage.removeItem('app_language')] : []),
                ...(defaultCharacterMigrationFailed || !defaultCharacterKeyMigrated
                  ? []
                  : [storage.removeItem(STORAGE_KEYS.CHARACTER_LIBRARY)]),
              ],
            );
            if (failedSceneStoryIds.size === 0) {
              await storage.removeItem(STORAGE_KEYS.STORIES);
            }
          }
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

export async function persistAppStoreStateNow(): Promise<void> {
  await createAppStoreStorage().setItem(STORAGE_KEYS.APP_STATE, JSON.stringify({
    state: buildPersistedAppState(useAppStore.getState()),
    version: APP_STORE_PERSIST_VERSION,
  }));
}

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
