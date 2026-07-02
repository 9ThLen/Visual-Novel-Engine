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

export const MAX_DATA_URI_ASSET_BYTES = 256 * 1024;
export const MAX_TOTAL_DATA_URI_BYTES = 1024 * 1024;

function getBase64DataUriBytes(uri: string): number | null {
  const match = uri.match(/^data:image\/([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (!match) return null;

  const imageSubtype = match[1].toLowerCase();
  if (imageSubtype === 'svg+xml') return null;

  const base64 = match[2].replace(/\s/g, '');
  if (!base64) return null;

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function getPersistableMediaLibrary(assets: unknown): LibraryAsset[] {
  if (!Array.isArray(assets)) return [];

  const candidates: Array<{ asset: LibraryAsset; dataUriBytes: number; index: number }> = [];

  assets.forEach((asset, index) => {
    if (!asset || typeof asset !== 'object') return;
    const candidate = asset as Partial<LibraryAsset>;

    if (typeof candidate.uri !== 'string') return;

    if (candidate.uri.startsWith('data:')) {
      const dataUriBytes = getBase64DataUriBytes(candidate.uri);
      if (dataUriBytes === null || dataUriBytes > MAX_DATA_URI_ASSET_BYTES) return;
      candidates.push({ asset: candidate as LibraryAsset, dataUriBytes, index });
      return;
    }

    candidates.push({ asset: candidate as LibraryAsset, dataUriBytes: 0, index });
  });

  let totalDataUriBytes = candidates.reduce((total, candidate) => total + candidate.dataUriBytes, 0);
  if (totalDataUriBytes <= MAX_TOTAL_DATA_URI_BYTES) {
    return candidates.map((candidate) => candidate.asset);
  }

  const removedIndexes = new Set<number>();
  const dataCandidates = candidates
    .filter((candidate) => candidate.dataUriBytes > 0)
    .sort((a, b) => b.dataUriBytes - a.dataUriBytes);

  for (const candidate of dataCandidates) {
    if (totalDataUriBytes <= MAX_TOTAL_DATA_URI_BYTES) break;
    totalDataUriBytes -= candidate.dataUriBytes;
    removedIndexes.add(candidate.index);
  }

  return candidates
    .filter((candidate) => !removedIndexes.has(candidate.index))
    .map((candidate) => candidate.asset);
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
