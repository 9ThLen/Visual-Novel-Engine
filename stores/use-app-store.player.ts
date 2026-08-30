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
 * State is deliberately **not** the studio's. It lives under its own key and
 * persists almost nothing: where the reader is, what they saved, which endings
 * they reached, and their settings (`lib/player-persistence.ts`). The story
 * itself is never written down — it arrives inlined in `index.html` and is
 * seeded fresh on every launch.
 *
 * An earlier version of this shared the studio's key and shape, on the reasoning
 * that the two could then read each other's storage. That was backwards: a
 * player served from the same origin as the studio — a project page with the
 * studio at `/` and a novel at `/novel/` — writes to the same localStorage, and
 * the player's frozen copy of a story would land on top of the author's draft
 * the moment a reader opened it.
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

import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  buildPlayerPersistedState,
  mergePlayerPersistedState,
  PLAYER_PERSIST_VERSION,
} from '@/lib/player-persistence';
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
      name: STORAGE_KEYS.PLAYER_STATE,
      version: PLAYER_PERSIST_VERSION,
      // The plain storage, not `createAppStoreStorage`: that wrapper exists to
      // compact scene records out of the studio's document and to guard its
      // cross-tab writes, and a player writes no scenes.
      storage: createJSONStorage(createPersistentStorage),
      partialize: (state) => buildPlayerPersistedState(state),
      merge: (persistedState, currentState) =>
        mergePlayerPersistedState(persistedState, currentState),
    },
  ),
);

export async function persistAppStoreStateNow(): Promise<void> {
  await createPersistentStorage().setItem(STORAGE_KEYS.PLAYER_STATE, JSON.stringify({
    state: buildPlayerPersistedState(useAppStore.getState()),
    version: PLAYER_PERSIST_VERSION,
  }));
}

export * from '@/stores/app-store-selectors';
export type { AppActions, AppState, MediaLibraryAsset } from '@/stores/app-store-types';
