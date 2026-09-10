/**
 * What a published player is allowed to write down.
 *
 * The defect these exist for: the player store used to share the studio's
 * storage key *and* its persisted shape, which includes `storiesMetadata` and
 * `sceneRecordsByStory`. A player served from the same origin as the studio —
 * a project page with the studio at `/` and a novel at `/novel/` — writes to the
 * same localStorage, so opening the novel replaced the author's draft with the
 * frozen release. The narrowness below is the fix, and it only holds as long as
 * nothing widens it.
 */
import {
  buildPlayerPersistedState,
  mergePlayerPersistedState,
  PLAYER_PERSIST_VERSION,
  type PlayerPersistenceState,
} from '@/lib/player-persistence';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { defaultUserSettings } from '@/lib/user-settings';
import type { PlaybackState } from '@/lib/engine/runtime-types';

function readerState(overrides: Partial<PlayerPersistenceState> = {}): PlayerPersistenceState {
  return {
    currentStoryId: 'story_1',
    playbackState: { storyId: 'story_1', currentSceneId: 'scene_2' } as unknown as PlaybackState,
    saveSlots: [{ id: 'slot-1', storyId: 'story_1' } as never],
    settings: defaultUserSettings,
    language: 'en',
    endingsReachedByStory: { story_1: ['scene_9'] },
    ...overrides,
  };
}

describe('what a player persists', () => {
  it('writes under its own key, never the studio’s', () => {
    expect(STORAGE_KEYS.PLAYER_STATE).not.toBe(STORAGE_KEYS.APP_STATE);
  });

  it('keeps the reader’s progress', () => {
    const persisted = buildPlayerPersistedState(readerState());

    expect(persisted.currentStoryId).toBe('story_1');
    expect(persisted.saveSlots).toHaveLength(1);
    expect(persisted.endingsReachedByStory).toEqual({ story_1: ['scene_9'] });
    expect(persisted.language).toBe('en');
  });

  /**
   * The story arrives inlined in `index.html` and is seeded on every launch, so
   * writing it down would at best be a slower copy — and at worst the thing that
   * lands on an author's draft.
   */
  it('writes no story, no scenes and no libraries', () => {
    const withStudioShape = {
      ...readerState(),
      storiesMetadata: [{ id: 'story_1', title: 'A Novel' }],
      sceneRecordsByStory: { story_1: { scene_1: { id: 'scene_1' } } },
      characterLibraries: { story_1: [{ id: 'char_1' }] },
      mediaLibrary: [{ id: 'asset_1' }],
    } as unknown as PlayerPersistenceState;

    const persisted = buildPlayerPersistedState(withStudioShape) as unknown as Record<string, unknown>;

    expect(Object.keys(persisted).sort()).toEqual([
      'currentStoryId',
      'endingsReachedByStory',
      'language',
      'playbackState',
      'saveSlots',
      'settings',
    ]);
  });

  it('has a version of its own, unrelated to the studio’s', () => {
    expect(PLAYER_PERSIST_VERSION).toBe(1);
  });
});

describe('restoring a player’s state', () => {
  it('lays a reader’s progress over the freshly seeded story', () => {
    const current = readerState({ saveSlots: [], currentStoryId: null });
    const merged = mergePlayerPersistedState(
      { saveSlots: [{ id: 'slot-9' }], currentStoryId: 'story_1', language: 'uk' },
      current,
    );

    expect(merged.saveSlots).toEqual([{ id: 'slot-9' }]);
    expect(merged.currentStoryId).toBe('story_1');
    expect(merged.language).toBe('uk');
  });

  /**
   * Merged field by field rather than spread: a state left behind by an older
   * build — or edited by hand — must not be able to reintroduce the very keys
   * the player refuses to write.
   */
  it('ignores keys a player does not persist', () => {
    const current = readerState();
    const merged = mergePlayerPersistedState(
      {
        saveSlots: [],
        storiesMetadata: [{ id: 'story_1', title: 'Smuggled in' }],
        sceneRecordsByStory: { story_1: { scene_1: {} } },
      },
      current,
    ) as unknown as Record<string, unknown>;

    expect(merged.storiesMetadata).toBeUndefined();
    expect(merged.sceneRecordsByStory).toBeUndefined();
  });

  it('survives a state that is not an object at all', () => {
    const current = readerState();
    expect(mergePlayerPersistedState(null, current)).toBe(current);
    expect(mergePlayerPersistedState('nonsense', current)).toBe(current);
  });

  it('normalizes settings rather than trusting them', () => {
    const merged = mergePlayerPersistedState(
      { settings: { textSpeed: 999 } },
      readerState(),
    );
    expect(merged.settings.textSpeed).toBeLessThanOrEqual(1);
  });
});
