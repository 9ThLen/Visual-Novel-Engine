import type { AppActions } from '@/stores/app-store-types';
import type { AppStoreSet } from '@/stores/app-store-slices/types';

export type PlaybackSliceActions = Pick<AppActions, 'loadCurrentStory' | 'updatePlaybackState'>;

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
  };
}
