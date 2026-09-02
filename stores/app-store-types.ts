import type { Language } from '@/lib/translations';
import type { UserSettings } from '@/lib/user-settings';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { SaveSlot, StoryMetadata } from '@/lib/story-domain';
import type { SceneRecord, SceneConnection } from '@/lib/engine/types';
import type { SceneRecordContentUpdates } from '@/lib/scene-operations';
import type { SnapshotMeta } from '@/lib/story-snapshots';
import type { ReleaseMeta } from '@/lib/release/release-storage';
import type { ReleaseShowcaseSource } from '@/lib/showcase/release-showcase';
import type { ReaderReleaseSource } from '@/lib/scene-access';
import type { Character } from '@/lib/character-types';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { MediaOrganizationByStory } from '@/lib/media-organization';
import type { StoryImageAssetIds } from '@/lib/story-image-library';
import type { StoryMediaAssetIds } from '@/lib/story-media-library';
import type { AiChangeSetApplyResult } from '@/lib/ai/change-set';
import type { AiBridgeSettings } from '@/lib/ai/bridge-config';

export interface AppState {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  sceneRecordHydration: Record<string, 'full' | 'window'>;
  currentStoryId: string | null;
  playbackState: PlaybackState | null;
  /**
   * Monotonic counter bumped whenever playback is replaced wholesale rather
   * than advanced — loading a save, or re-entering the scene already on
   * screen. `playbackState` alone cannot express that: loading a slot for the
   * current scene leaves storyId/sceneId identical, so nothing downstream
   * re-runs and the load is a silent no-op. Hosts key their scene restart on
   * this (see useSceneExecutor's `resetKey`). Bumped by loadGame. Not
   * persisted: it only ever matters relative to the previous value within a
   * session.
   */
  playbackGeneration: number;
  settings: UserSettings;
  aiBridgeSettings: AiBridgeSettings;
  saveSlots: SaveSlot[];
  audioLibraries: Record<string, AudioLibraryItem[]>;
  characterLibraries: Record<string, Character[]>;
  language: Language;
  mediaLibrary: LibraryAsset[];
  imageAssetIdsByStory: StoryImageAssetIds;
  mediaAssetIdsByStory: StoryMediaAssetIds;
  /**
   * storyId → how the author has filed that story's media. The only thing in
   * the media library that is stored rather than derived: no scene records
   * which chapter a background belongs to.
   */
  mediaOrganizationByStory: MediaOrganizationByStory;
  /** storyId → ids of terminal scenes the reader has reached. */
  endingsReachedByStory: Record<string, string[]>;
  /**
   * storyId → its frozen releases, newest version first. A read-through cache
   * of the release storage keys, not persisted app state: the artifacts on
   * disk are the source of truth, and this is only what the UI has looked at.
   */
  releasesByStory: Record<string, ReleaseMeta[]>;
  /**
   * storyId → the release the showcase renders. Absent means the story is a
   * draft and has no card at all.
   */
  releaseShowcaseByStory: Record<string, ReleaseShowcaseSource>;
  /**
   * The frozen release the reader is playing, if any. Ephemeral: it is not
   * persisted, because a reader that resumed into a release the author has
   * since deleted would have nothing to play.
   */
  readerRelease: ReaderReleaseSource | null;
  /**
   * storyId → the scene the author last had open in the document editor. Drives
   * the studio's «Continue»; a stale id is harmless because the shelf falls back
   * to the start scene when the scene is gone.
   */
  lastEditedSceneByStory: Record<string, string>;
  /**
   * Set while the reader is blocked on media that owns the screen — currently a
   * cutscene. Saving mid-clip would produce a slot nobody can resume from
   * unambiguously, so saves stand down while it is set.
   *
   * Ephemeral on purpose: it is absent from buildPersistedAppState(), so a
   * crash mid-cutscene cannot leave saving disabled on the next launch.
   */
  readerBlockingMedia: { stepId: string; kind: 'cutscene' } | null;
  /**
   * Thumbnail reference for the scene state currently rendered by the reader.
   * `undefined` means no reader is supplying runtime state; `null` means the
   * rendered state intentionally has no visual thumbnail. Ephemeral like the
   * blocking-media guard, so stale playback UI never survives a reload.
   */
  readerSceneThumbnailUri: string | null | undefined;
  isLoaded: boolean;
  migrationError: string | null;
}

export interface AppActions {
  migrateFromLegacyKeys: () => Promise<void>;
  clearMigrationError: () => void;
  loadCurrentStory: (storyId: string | null) => Promise<void>;
  updatePlaybackState: (state: PlaybackState | null) => void;
  setReaderBlockingMedia: (media: AppState['readerBlockingMedia']) => void;
  setReaderSceneThumbnailUri: (uri: AppState['readerSceneThumbnailUri']) => void;
  saveGame: (slotId: string) => boolean;
  loadGame: (slotId: string) => { storyId: string; playbackState: PlaybackState } | null;
  deleteSaveSlot: (slotId: string) => void;
  syncAutoSave: (newSlot: SaveSlot) => void;
  updateSettings: (partial: Partial<UserSettings>) => void;
  updateAiBridgeSettings: (partial: Partial<AppState['aiBridgeSettings']>) => void;
  hydrateSceneRecordsForStory: (storyId: string) => Promise<void>;
  createStory: (title: string) => { storyId: string; sceneId: string };
  deleteStory: (storyId: string) => void;
  updateStoryMetadata: (storyId: string, updates: Partial<StoryMetadata>) => void;
  /** Records where the author is in a story's manuscript; see `lastEditedSceneByStory`. */
  noteSceneOpened: (storyId: string, sceneId: string) => void;
  deleteScene: (storyId: string, sceneId: string) => void;
  setLanguage: (lang: Language) => void;
  setCharacterLibrary: (storyId: string, characters: Character[]) => void;
  setAudioLibrary: (storyId: string, items: AudioLibraryItem[]) => void;
  setMediaLibrary: (assets: LibraryAsset[]) => void;
  recordEndingReached: (storyId: string, sceneId: string) => void;
  addImageAssetToStory: (storyId: string, assetId: string) => void;
  removeImageAssetFromStory: (storyId: string, assetId: string) => void;
  addMediaAssetToStory: (storyId: string, assetId: string) => void;
  removeMediaAssetFromStory: (storyId: string, assetId: string) => void;
  /** The new folder's id, or null when the name was blank or already taken. */
  createMediaFolder: (storyId: string, name: string) => string | null;
  renameMediaFolder: (storyId: string, folderId: string, name: string) => void;
  /** The folder goes; what was in it becomes unfiled. */
  deleteMediaFolder: (storyId: string, folderId: string) => void;
  /** `null` takes the files out of whatever folder they were in. */
  moveMediaToFolder: (storyId: string, keys: string[], folderId: string | null) => void;
  addMediaTag: (storyId: string, keys: string[], tag: string) => void;
  removeMediaTag: (storyId: string, keys: string[], tag: string) => void;

  hydrateReaderSceneWindow: (
    storyId: string,
    sceneId: string,
    maxPrefetchScenes?: number
  ) => Promise<boolean>;
  saveSceneRecord: (record: SceneRecord) => void;
  commitAiChangeSet: (storyId: string, result: Extract<AiChangeSetApplyResult, { ok: true }>) => void;
  updateSceneRecordPreservingMeta: (
    storyId: string,
    sceneId: string,
    updates: SceneRecordContentUpdates
  ) => void;
  getScenesForStory: (storyId: string) => SceneRecord[];
  updateSceneConnection: (storyId: string, fromSceneId: string, connection: SceneConnection) => void;
  removeSceneConnection: (
    storyId: string,
    fromSceneId: string,
    targetSceneId: string,
    outputPort?: string
  ) => void;
  setStartScene: (storyId: string, sceneId: string) => void;
  reorderScenes: (storyId: string, sceneIds: string[]) => void;
  createStorySnapshot: (
    storyId: string,
    name: string,
    automatic?: boolean,
  ) => Promise<SnapshotMeta | null>;
  restoreStorySnapshot: (storyId: string, snapshotId: string) => Promise<boolean>;
  loadReleasesForStory: (storyId: string) => Promise<ReleaseMeta[]>;
  loadPublishedReleases: () => Promise<void>;
  openReleaseForReading: (storyId: string, releaseId?: string) => Promise<boolean>;
  closeReleaseReading: () => void;
  setReleasePublished: (storyId: string, releaseId: string, published: boolean) => Promise<void>;
  deleteRelease: (storyId: string, releaseId: string) => Promise<void>;
}

export type AppStore = AppState & AppActions;
export type MediaLibraryAsset = LibraryAsset;

/**
 * What a published player build's store can do.
 *
 * Deliberately a hand-listed subset rather than `Omit<AppActions, …>`: adding
 * an authoring action to `AppActions` must not silently grant it to players.
 * The composition that implements this lives in `stores/use-app-store.player.ts`
 * and is checked by `tools/check-player-bundle.mjs`.
 */
export type PlayerAppActions = Pick<
  AppActions,
  | 'migrateFromLegacyKeys'
  | 'clearMigrationError'
  | 'loadCurrentStory'
  | 'updatePlaybackState'
  | 'setReaderBlockingMedia'
  | 'setReaderSceneThumbnailUri'
  | 'recordEndingReached'
  | 'saveGame'
  | 'loadGame'
  | 'deleteSaveSlot'
  | 'syncAutoSave'
  | 'updateSettings'
  | 'updateAiBridgeSettings'
  | 'setLanguage'
  | 'hydrateSceneRecordsForStory'
  | 'hydrateReaderSceneWindow'
  | 'getScenesForStory'
  | 'closeReleaseReading'
>;

export type PlayerAppStore = AppState & PlayerAppActions;
