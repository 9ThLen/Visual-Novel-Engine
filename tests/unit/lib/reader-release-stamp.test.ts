import {
  __resetPlayerModeForTests,
  loadPlayerConfig,
  PLAYER_CONFIG_GLOBAL,
} from '@/lib/player-mode';
import {
  resolveActiveReaderRelease,
  resolveReaderReleaseStamp,
} from '@/lib/reader-release-stamp';

describe('reader release resolution', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[PLAYER_CONFIG_GLOBAL];
    __resetPlayerModeForTests();
  });

  it('uses the inlined player release for both save stamps and compatibility checks', async () => {
    (globalThis as Record<string, unknown>)[PLAYER_CONFIG_GLOBAL] = {
      version: 1,
      story: {
        id: 'story_1',
        title: 'Published story',
        startSceneId: 'start',
        scenes: { start: {}, finish: {} },
      },
      release: { releaseId: 'release_2', version: '1.2.0' },
    };
    await loadPlayerConfig();

    expect(resolveActiveReaderRelease(null, 'story_1')).toEqual({
      releaseId: 'release_2',
      version: '1.2.0',
      sceneIds: ['start', 'finish'],
    });
    expect(resolveReaderReleaseStamp(null, 'story_1')).toEqual({
      releaseId: 'release_2',
      version: '1.2.0',
    });
  });

  it('does not leak a player release onto another story', async () => {
    (globalThis as Record<string, unknown>)[PLAYER_CONFIG_GLOBAL] = {
      version: 1,
      story: {
        id: 'story_1',
        title: 'Published story',
        startSceneId: 'start',
        scenes: { start: {} },
      },
      release: { releaseId: 'release_2', version: '1.2.0' },
    };
    await loadPlayerConfig();

    expect(resolveActiveReaderRelease(null, 'story_2')).toBeNull();
  });
});
