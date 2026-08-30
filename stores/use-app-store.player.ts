/**
 * The app store as a published player has it.
 *
 * `stores/use-app-store.ts` is the studio's store: it composes every slice,
 * including the ones that create stories, rewrite scenes and take snapshots.
 * A player build must not merely avoid calling those — it must not contain
 * them. Metro swaps this module in for `@/stores/use-app-store` under the
 * player profile (see `metro.config.js`), so the authoring slices and
 * everything they pull in never enter the bundle.
 *
 * State is byte-for-byte the studio's: same storage key, same persist version,
 * same migrations. A player and the studio can therefore read each other's
 * storage, which matters for the web build where both may be served from the
 * same origin — and it means a save written here stays loadable if the story is
 * ever opened in the studio again.
 *
 * What is missing here is missing on purpose:
 *   - story slice        — a player creates and deletes no stories
 *   - snapshots slice    — and takes no snapshots of the author's work
 *   - scene write slice  — and cannot rewrite the story it is playing
 *   - libraries slice    — character/audio/media libraries are authored, not played
 *   - releases slice     — a player *is* the frozen artifact; it never browses
 *                          the author's release shelf. `readerRelease` stays
 *                          null and `closeReleaseReading` clears it truthfully.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createAppStoreStorage } from '@/lib/app-store-storage';
import {
  APP_STORE_PERSIST_VERSION,
  buildPersistedAppState,
  mergePersistedAppState,
  migratePersistedAppState,
} from '@/lib/app-store-persistence';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { initialAppState } from '@/stores/app-store-initial-state';
import { createPlaybackSlice } from '@/stores/app-store-slices/playback-slice';
import { createPreferencesSlice } from '@/stores/app-store-slices/preferences-slice';
import { createSavesSlice } from '@/stores/app-store-slices/saves-slice';
import { createSceneReadSlice } from '@/stores/app-store-slices/scene-read-slice';
import type { PlayerAppStore } from '@/stores/app-store-types';

export const useAppStore = create<PlayerAppStore>()(
  persist(
    (set, get) => ({
      ...initialAppState,

      ...createPlaybackSlice(set),
      ...createPreferencesSlice(set),
      ...createSavesSlice(set, get),
      ...createSceneReadSlice(set, get),

      closeReleaseReading: () => set({ readerRelease: null }),

      /**
       * A player install has no studio history behind it, so there are no
       * legacy keys to migrate. The bootstrap still awaits this — it is where
       * `isLoaded` is raised in both stores — so it stays a real step rather
       * than being deleted from the boot sequence.
       */
      migrateFromLegacyKeys: async () => {
        set({ isLoaded: true });
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
    },
  ),
);

export async function persistAppStoreStateNow(): Promise<void> {
  await createAppStoreStorage().setItem(STORAGE_KEYS.APP_STATE, JSON.stringify({
    state: buildPersistedAppState(useAppStore.getState()),
    version: APP_STORE_PERSIST_VERSION,
  }));
}

export * from '@/stores/app-store-selectors';
export type { AppActions, AppState, MediaLibraryAsset } from '@/stores/app-store-types';
