import { buildCanonicalLoadSnapshot, buildCanonicalSaveSlot } from '@/lib/reader-runtime';
import { buildScopedReaderRuntimeSnapshot } from '@/lib/reader-runtime-snapshot';
import type { SaveSlot } from '@/lib/story-domain';
import type { AppActions } from '@/stores/app-store-types';
import type { AppStoreGet, AppStoreSet } from '@/stores/app-store-slices/types';

const QUICK_SAVE_SLOT_PREFIX = 'quick-';

export type SavesSliceActions = Pick<
  AppActions,
  'deleteSaveSlot' | 'loadGame' | 'saveGame' | 'syncAutoSave'
>;

export function getQuickSaveSlotId(storyId: string): string {
  return `${QUICK_SAVE_SLOT_PREFIX}${storyId}`;
}

export function isQuickSaveSlotId(slotId: string): boolean {
  return slotId.startsWith(QUICK_SAVE_SLOT_PREFIX);
}

export function upsertSaveSlot(saveSlots: SaveSlot[], newSlot: SaveSlot): SaveSlot[] {
  return [...saveSlots.filter((slot) => slot.id !== newSlot.id), newSlot];
}

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
        saveSlots: upsertSaveSlot(current.saveSlots, newSlot),
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
        saveSlots: upsertSaveSlot(state.saveSlots, newSlot),
      })),
  };
}
