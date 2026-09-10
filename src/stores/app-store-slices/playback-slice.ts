import type { AppActions } from '@/stores/app-store-types';
import type { AppStateSet } from '@/stores/app-store-slices/types';

export type PlaybackSliceActions = Pick<
  AppActions,
  | 'loadCurrentStory'
  | 'updatePlaybackState'
  | 'recordEndingReached'
  | 'setReaderBlockingMedia'
  | 'setReaderSceneThumbnailUri'
>;

export function createPlaybackSlice(set: AppStateSet): PlaybackSliceActions {
  return {
    loadCurrentStory: async (storyId) => {
      if (!storyId) {
        set({ currentStoryId: null, playbackState: null, readerSceneThumbnailUri: undefined });
        return;
      }
      set((state) => ({
        currentStoryId: storyId,
        ...(state.currentStoryId === storyId ? {} : { readerSceneThumbnailUri: undefined }),
      }));
    },

    updatePlaybackState: (nextPlaybackState) => set((state) => {
      const sameScene = nextPlaybackState !== null
        && state.playbackState?.storyId === nextPlaybackState.storyId
        && state.playbackState?.currentSceneId === nextPlaybackState?.currentSceneId;
      return {
        playbackState: nextPlaybackState,
        ...(sameScene ? {} : { readerSceneThumbnailUri: undefined }),
      };
    }),

    setReaderBlockingMedia: (media) => set({ readerBlockingMedia: media }),

    setReaderSceneThumbnailUri: (uri) => set({ readerSceneThumbnailUri: uri }),

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
