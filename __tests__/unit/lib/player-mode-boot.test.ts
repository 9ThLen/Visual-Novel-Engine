import { resetAppStoreState, useAppStore } from '../../../__mocks__/stores/use-app-store';
import {
  __resetPlayerModeBootForTests,
  ensurePlayerStorySeeded,
} from '@/lib/player-mode-boot';
import type { PlayerConfig } from '@/lib/player-mode';

const config: PlayerConfig = {
  version: 1,
  story: {
    id: 'story-player',
    title: 'Player story',
    startSceneId: 'scene-1',
    createdAt: 1,
    updatedAt: 1,
    scenes: {
      'scene-1': {
        id: 'scene-1',
        text: 'Hello',
        characters: [],
        choices: [],
      },
    },
  },
};

describe('player-mode boot', () => {
  beforeEach(() => {
    resetAppStoreState();
    __resetPlayerModeBootForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('times out a stuck hydration and lets a later retry seed the story', async () => {
    useAppStore.persist.hasHydrated = vi.fn(() => false);
    useAppStore.persist.onFinishHydration = vi.fn(() => vi.fn());

    const firstAttempt = ensurePlayerStorySeeded(config);
    const rejection = expect(firstAttempt).rejects.toThrow('hydration timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    useAppStore.persist.hasHydrated = vi.fn(() => true);
    await expect(ensurePlayerStorySeeded(config)).resolves.toBe('story-player');
    expect(useAppStore.getState().storiesMetadata).toEqual([
      expect.objectContaining({ id: 'story-player' }),
    ]);
  });
});
