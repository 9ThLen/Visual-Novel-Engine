import type { AppActions } from '@/stores/app-store-types';
import type { AppStoreSet } from '@/stores/app-store-slices/types';

export type PlaybackSliceActions = Pick<
  AppActions,
  'loadCurrentStory' | 'updatePlaybackState' | 'recordEndingReached'
>;

export function createPlaybackSlice(set: AppStoreSet): PlaybackSliceActions {
  return {
    loadCurrentStory: async (storyId) => {
      if (!storyId) {
        set({ currentStoryId: null, playbackState: null });
        return;
      }
      set({ currentStoryId: storyId });
    },

    updatePlaybackState: (state) => set({ playbackState: state }),

    // Idempotent: reaching the same ending twice is a re-read, not new progress.
    recordEndingReached: (storyId, sceneId) =>
      set((state) => {
        const reached = state.endingsReachedByStory[storyId] ?? [];
        if (reached.includes(sceneId)) return state;
        return {
          endingsReachedByStory: {
            ...state.endingsReachedByStory,
            [storyId]: [...reached, sceneId],
          },
        };
      }),
  };
}
