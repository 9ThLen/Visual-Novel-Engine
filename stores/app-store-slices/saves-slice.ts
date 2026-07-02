import { buildCanonicalLoadSnapshot, buildCanonicalSaveSlot } from '@/lib/reader-runtime';
import { buildScopedReaderRuntimeSnapshot } from '@/lib/reader-runtime-snapshot';
import type { AppActions } from '@/stores/app-store-types';
import type { AppStoreGet, AppStoreSet } from '@/stores/app-store-slices/types';

export type SavesSliceActions = Pick<
  AppActions,
  'deleteSaveSlot' | 'loadGame' | 'saveGame' | 'syncAutoSave'
>;

export function createSavesSlice(set: AppStoreSet, get: AppStoreGet): SavesSliceActions {
  return {
    saveGame: (slotId) => {
      const state = get();
      if (!state.playbackState || !state.currentStoryId) return false;
      const newSlot = buildCanonicalSaveSlot(
        slotId,
        buildScopedReaderRuntimeSnapshot(
          state,
          state.playbackState.storyId,
          state.playbackState.currentSceneId,
        ),
        state.playbackState,
      );
      if (!newSlot) return false;

      set((current) => ({
        saveSlots: [...current.saveSlots.filter((slot) => slot.id !== slotId), newSlot],
      }));
      return true;
    },

    loadGame: (slotId) => {
      const state = get();
      const slot = state.saveSlots.find((saveSlot) => saveSlot.id === slotId);
      if (!slot) return null;

      const loaded = buildCanonicalLoadSnapshot(
        buildScopedReaderRuntimeSnapshot(state, slot.storyId, slot.sceneId),
        slot,
      );
      if (!loaded) return null;

      set({
        currentStoryId: loaded.storyId,
        playbackState: loaded.playbackState,
      });

      return loaded;
    },

    deleteSaveSlot: (slotId) =>
      set((state) => ({ saveSlots: state.saveSlots.filter((slot) => slot.id !== slotId) })),

    syncAutoSave: (newSlot) =>
      set((state) => ({
        saveSlots: [...state.saveSlots.filter((slot) => slot.id !== 'autosave'), newSlot],
      })),
  };
}
