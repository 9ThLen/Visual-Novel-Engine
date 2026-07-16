import type { Language } from '@/lib/translations';
import type { UserSettings } from '@/lib/user-settings';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { SaveSlot, StoryMetadata } from '@/lib/story-domain';
import type { SceneRecord, SceneConnection } from '@/lib/engine/types';
import type { SceneRecordContentUpdates } from '@/lib/scene-operations';
import type { SnapshotMeta } from '@/lib/story-snapshots';
import type { Character } from '@/lib/character-types';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { StoryImageAssetIds } from '@/lib/story-image-library';
import type { AiChangeSetApplyResult } from '@/lib/ai/change-set';
import type { AiBridgeSettings } from '@/lib/ai/bridge-config';

export interface AppState {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  sceneRecordHydration: Record<string, 'full' | 'window'>;
  currentStoryId: string | null;
  playbackState: PlaybackState | null;
  settings: UserSettings;
  aiBridgeSettings: AiBridgeSettings;
  saveSlots: SaveSlot[];
  audioLibraries: Record<string, AudioLibraryItem[]>;
  characterLibraries: Record<string, Character[]>;
  language: Language;
  mediaLibrary: LibraryAsset[];
  imageAssetIdsByStory: StoryImageAssetIds;
  /** storyId → ids of terminal scenes the reader has reached. */
  endingsReachedByStory: Record<string, string[]>;
  isLoaded: boolean;
  migrationError: string | null;
}

export interface AppActions {
  migrateFromLegacyKeys: () => Promise<void>;
  clearMigrationError: () => void;
  loadCurrentStory: (storyId: string | null) => Promise<void>;
  updatePlaybackState: (state: PlaybackState | null) => void;
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
  deleteScene: (storyId: string, sceneId: string) => void;
  setLanguage: (lang: Language) => void;
  setCharacterLibrary: (storyId: string, characters: Character[]) => void;
  setAudioLibrary: (storyId: string, items: AudioLibraryItem[]) => void;
  setMediaLibrary: (assets: LibraryAsset[]) => void;
  recordEndingReached: (storyId: string, sceneId: string) => void;
  addImageAssetToStory: (storyId: string, assetId: string) => void;
  removeImageAssetFromStory: (storyId: string, assetId: string) => void;

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
}

export type AppStore = AppState & AppActions;
export type MediaLibraryAsset = LibraryAsset;
