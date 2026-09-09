import { buildPersistedAppState } from '@/lib/app-store-persistence';
import { initialAppState } from '@/stores/app-store-initial-state';
import { createPlaybackSlice } from '@/stores/app-store-slices/playback-slice';
import type { AppStore } from '@/stores/app-store-types';

function createStore() {
  let state = { ...initialAppState } as AppStore;
  const set = (partial: Partial<AppStore> | ((s: AppStore) => Partial<AppStore>)) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };
  const slice = createPlaybackSlice(set);
  return { slice, get: () => state };
}

describe('recordEndingReached', () => {
  it('records an ending per story', () => {
    const { slice, get } = createStore();

    slice.recordEndingReached('story-1', 'end-a');
    slice.recordEndingReached('story-2', 'end-b');

    expect(get().endingsReachedByStory).toEqual({ 'story-1': ['end-a'], 'story-2': ['end-b'] });
  });

  it('is idempotent — re-reading an ending is not new progress', () => {
    const { slice, get } = createStore();

    slice.recordEndingReached('story-1', 'end-a');
    slice.recordEndingReached('story-1', 'end-a');
    slice.recordEndingReached('story-1', 'end-b');

    expect(get().endingsReachedByStory['story-1']).toEqual(['end-a', 'end-b']);
  });

  it('survives persistence', () => {
    const { slice, get } = createStore();
    slice.recordEndingReached('story-1', 'end-a');

    const persisted = buildPersistedAppState(get());

    expect(persisted.endingsReachedByStory).toEqual({ 'story-1': ['end-a'] });
  });
});
