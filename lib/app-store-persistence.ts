import type { AudioLibraryItem } from '@/lib/audio-types';
import {
  CHARACTER_AUTHORING_SCHEMA_VERSION,
  migrateCharacterLibraries,
} from '@/lib/character-migration';
import type { Character } from '@/lib/character-types';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { SaveSlot, StoryMetadata } from '@/lib/story-domain';
import type { Language } from '@/lib/translations';
import type { UserSettings } from '@/lib/user-settings';

export const APP_STORE_PERSIST_VERSION = 2;

export type AppStorePersistenceState = {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  sceneRecordHydration: Record<string, 'full' | 'window'>;
  currentStoryId: string | null;
  playbackState: PlaybackState | null;
  settings: UserSettings;
  saveSlots: SaveSlot[];
  audioLibraries: Record<string, AudioLibraryItem[]>;
  characterLibraries: Record<string, Character[]>;
  language: Language;
  mediaLibrary: LibraryAsset[];
};

export function getPersistableMediaLibrary(assets: unknown): LibraryAsset[] {
  if (!Array.isArray(assets)) return [];

  return assets.filter((asset): asset is LibraryAsset => {
    if (!asset || typeof asset !== 'object') return false;
    const candidate = asset as Partial<LibraryAsset>;
    return typeof candidate.uri === 'string' && !candidate.uri.startsWith('data:');
  });
}

export function buildPersistedAppState(state: AppStorePersistenceState): AppStorePersistenceState {
  return {
    storiesMetadata: state.storiesMetadata,
    sceneRecordsByStory: state.sceneRecordsByStory,
    sceneRecordHydration: state.sceneRecordHydration,
    currentStoryId: state.currentStoryId,
    playbackState: state.playbackState,
    settings: state.settings,
    saveSlots: state.saveSlots,
    audioLibraries: state.audioLibraries,
    characterLibraries: state.characterLibraries,
    language: state.language,
    mediaLibrary: getPersistableMediaLibrary(state.mediaLibrary),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function withCharacterSchemaVersion(stories: StoryMetadata[]): StoryMetadata[] {
  return stories.map((story) => ({
    ...story,
    characterAuthoringSchemaVersion:
      story.characterAuthoringSchemaVersion ?? CHARACTER_AUTHORING_SCHEMA_VERSION,
  }));
}

export function migratePersistedAppState(
  persistedState: unknown,
  fromVersion: number,
): unknown {
  if (!isRecord(persistedState) || fromVersion > APP_STORE_PERSIST_VERSION) {
    return persistedState;
  }

  const migrated: Partial<AppStorePersistenceState> = { ...persistedState };

  if ('mediaLibrary' in migrated) {
    migrated.mediaLibrary = getPersistableMediaLibrary(migrated.mediaLibrary);
  }
  if ('characterLibraries' in migrated) {
    migrated.characterLibraries = migrateCharacterLibraries(migrated.characterLibraries);
  }
  if (Array.isArray(migrated.storiesMetadata)) {
    migrated.storiesMetadata = withCharacterSchemaVersion(migrated.storiesMetadata);
  }

  return migrated;
}

export function mergePersistedAppState<TState extends AppStorePersistenceState>(
  persistedState: unknown,
  currentState: TState,
): TState {
  if (!isRecord(persistedState)) {
    return currentState;
  }

  const persisted = migratePersistedAppState(persistedState, 0) as Partial<AppStorePersistenceState>;
  return {
    ...currentState,
    ...persisted,
    mediaLibrary:
      'mediaLibrary' in persisted
        ? getPersistableMediaLibrary(persisted.mediaLibrary)
        : currentState.mediaLibrary,
    characterLibraries:
      'characterLibraries' in persisted
        ? migrateCharacterLibraries(persisted.characterLibraries)
        : currentState.characterLibraries,
    storiesMetadata: withCharacterSchemaVersion(
      Array.isArray(persisted.storiesMetadata)
        ? persisted.storiesMetadata
        : currentState.storiesMetadata,
    ),
    sceneRecordHydration: currentState.sceneRecordHydration,
  };
}
