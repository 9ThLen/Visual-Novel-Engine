/**
 * The player build's store: what it can do, and — more to the point — what it
 * cannot. See `stores/use-app-store.player.ts`.
 */
import { useAppStore as usePlayerStore } from '@/stores/use-app-store.player';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { SceneRecord } from '@/lib/engine/types';

/** Every action a player has. Adding one here should be a deliberate act. */
const PLAYER_ACTIONS = [
  'migrateFromLegacyKeys',
  'clearMigrationError',
  'loadCurrentStory',
  'updatePlaybackState',
  'setReaderBlockingMedia',
  'setReaderSceneThumbnailUri',
  'recordEndingReached',
  'saveGame',
  'loadGame',
  'deleteSaveSlot',
  'syncAutoSave',
  'updateSettings',
  'updateAiBridgeSettings',
  'setLanguage',
  'hydrateSceneRecordsForStory',
  'hydrateReaderSceneWindow',
  'getScenesForStory',
  'closeReleaseReading',
] as const;

/**
 * Authoring actions the studio store has. A player that shipped any of these
 * could rewrite the story it was handed.
 */
const AUTHORING_ACTIONS = [
  'createStory',
  'deleteStory',
  'updateStoryMetadata',
  'noteSceneOpened',
  'deleteScene',
  'saveSceneRecord',
  'commitAiChangeSet',
  'updateSceneRecordPreservingMeta',
  'updateSceneConnection',
  'removeSceneConnection',
  'setStartScene',
  'reorderScenes',
  'createStorySnapshot',
  'restoreStorySnapshot',
  'setCharacterLibrary',
  'setAudioLibrary',
  'setMediaLibrary',
  'addImageAssetToStory',
  'removeImageAssetFromStory',
  'addMediaAssetToStory',
  'removeMediaAssetFromStory',
  'loadReleasesForStory',
  'loadPublishedReleases',
  'openReleaseForReading',
  'setReleasePublished',
  'deleteRelease',
] as const;

function sceneRecord(id: string, storyId = 'story-1'): SceneRecord {
  return {
    id,
    storyId,
    name: id,
    description: '',
    tags: [],
    timeline: [],
    sceneState: {
      backgroundAssetId: null,
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      musicTrackId: null,
      musicPlaying: false,
      musicVolume: 1,
      variables: {},
      dialogueHistory: [],
      currentChoices: null,
      isTransitioning: false,
      transitionTarget: null,
    },
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function playback(): PlaybackState {
  return {
    storyId: 'story-1',
    currentSceneId: 'scene-1',
    isPlaying: true,
    variables: {},
    history: [],
    currentDialogueIndex: 0,
    choicesMade: [],
  } as unknown as PlaybackState;
}

describe('the player app store', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      storiesMetadata: [
        {
          id: 'story-1',
          title: 'Story',
          startSceneId: 'scene-1',
          createdAt: 1,
          updatedAt: 1,
          sceneCount: 1,
        },
      ],
      sceneRecordsByStory: { 'story-1': { 'scene-1': sceneRecord('scene-1') } },
      sceneRecordHydration: { 'story-1': 'full' },
      saveSlots: [],
      currentStoryId: 'story-1',
      playbackState: playback(),
      readerBlockingMedia: null,
      readerSceneThumbnailUri: null,
      readerRelease: null,
      isLoaded: false,
    });
  });

  it('has every action a reader needs', () => {
    const state = usePlayerStore.getState() as unknown as Record<string, unknown>;
    for (const action of PLAYER_ACTIONS) {
      expect(typeof state[action], action).toBe('function');
    }
  });

  it('has no way to change the author’s work', () => {
    const state = usePlayerStore.getState() as unknown as Record<string, unknown>;
    const present = AUTHORING_ACTIONS.filter((action) => state[action] !== undefined);
    expect(present).toEqual([]);
  });

  // The list above is the contract; anything else appearing means a slice was
  // added to the player composition without anyone deciding it belonged there.
  it('has nothing beyond that list', () => {
    const state = usePlayerStore.getState() as unknown as Record<string, unknown>;
    const actions = Object.keys(state).filter((key) => typeof state[key] === 'function');
    expect(actions.sort()).toEqual([...PLAYER_ACTIONS].sort());
  });

  it('saves and loads a slot', () => {
    const saved = usePlayerStore.getState().saveGame('slot-1');
    expect(saved).toBe(true);
    expect(usePlayerStore.getState().saveSlots).toHaveLength(1);

    const loaded = usePlayerStore.getState().loadGame('slot-1');
    expect(loaded?.storyId).toBe('story-1');
    expect(loaded?.playbackState.currentSceneId).toBe('scene-1');
  });

  // A player install has no studio history, so the migration is a no-op — but
  // it is still where `isLoaded` is raised, and the storage bootstrap awaits it.
  it('finishes the boot migration without inventing state', () => {
    const before = usePlayerStore.getState().storiesMetadata;

    return usePlayerStore
      .getState()
      .migrateFromLegacyKeys()
      .then(() => {
        expect(usePlayerStore.getState().isLoaded).toBe(true);
        expect(usePlayerStore.getState().storiesMetadata).toBe(before);
        expect(usePlayerStore.getState().migrationError).toBeNull();
      });
  });

  it('clears reader release state truthfully', () => {
    usePlayerStore.getState().closeReleaseReading();
    expect(usePlayerStore.getState().readerRelease).toBeNull();
  });
});
