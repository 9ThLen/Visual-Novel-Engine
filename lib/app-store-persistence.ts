import type { AudioLibraryItem } from '@/lib/audio-types';
import { migrateSceneRecordsByStory } from '@/lib/audio-block-migration';
import {
  CHARACTER_AUTHORING_SCHEMA_VERSION,
  migrateCharacterLibraries,
} from '@/lib/character-migration';
import type { Character } from '@/lib/character-types';
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { SceneRecord } from '@/lib/engine/types';
import { canConvertDataUri, type AssetType, type LibraryAsset } from '@/lib/media-library-service';
import type { SaveSlot, StoryMetadata } from '@/lib/story-domain';
import { normalizeStoryMetadata } from '@/lib/story-domain';
import type { Language } from '@/lib/translations';
import type { UserSettings } from '@/lib/user-settings';
import {
  migrateStoryImageAssetIds,
  normalizeStoryImageAssetIds,
  type StoryImageAssetIds,
} from '@/lib/story-image-library';
import type { AiBridgeSettings } from '@/lib/ai/bridge-config';
import type { BridgeProvider, CodexBetaConsent } from '@/lib/bridge-protocol';

export const APP_STORE_PERSIST_VERSION = 5;

export type AppStorePersistenceState = {
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
  endingsReachedByStory: Record<string, string[]>;
};

export const MAX_DATA_URI_ASSET_BYTES = 256 * 1024;
export const MAX_TOTAL_DATA_URI_BYTES = 1024 * 1024;
let enforceWebMediaReferenceInvariant = false;

/** Enable only after the one-time Blob migration has completed successfully. */
export function setWebMediaReferenceInvariant(enabled: boolean): void {
  enforceWebMediaReferenceInvariant = enabled;
}

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

    const isInlineUri = candidate.uri.startsWith('data:');
    // blob: URLs die with the document, so persisting one always yields a
    // dangling reference on the next load.
    const isEphemeralUri = candidate.uri.startsWith('blob:');

    if (enforceWebMediaReferenceInvariant && (isInlineUri || isEphemeralUri)) {
      if (__DEV__) {
        console.warn('[Storage] Refusing to persist unstable media reference after Blob migration', {
          assetId: candidate.id,
        });
      }
      return;
    }

    if (isInlineUri) {
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

/**
 * Read-side counterpart of getPersistableMediaLibrary.
 *
 * The size caps are a *write*-side quota guard — they exist to protect the
 * localStorage fallback used when IndexedDB is unavailable. Applying them on
 * hydrate would destroy the very oversized inline assets the Blob migration
 * exists to rescue, before the migration ever sees them. So nothing is dropped
 * here for being large; only references the migration could never convert are
 * dropped, otherwise a single malformed data URI would make the migration throw
 * on every start and pin the caps open forever.
 */
export function getHydratableMediaLibrary(assets: unknown): LibraryAsset[] {
  if (!Array.isArray(assets)) return [];

  const hydratable: LibraryAsset[] = [];

  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') continue;
    const candidate = asset as Partial<LibraryAsset>;

    if (typeof candidate.uri !== 'string') continue;

    // blob: URLs die with the document that created them.
    if (candidate.uri.startsWith('blob:')) continue;

    if (candidate.uri.startsWith('data:')) {
      const type: AssetType = candidate.type === 'audio' ? 'audio' : 'image';
      if (!canConvertDataUri(candidate.uri, type)) continue;
    }

    hydratable.push(candidate as LibraryAsset);
  }

  return hydratable;
}

export function buildPersistedAppState(state: AppStorePersistenceState): AppStorePersistenceState {
  return {
    storiesMetadata: state.storiesMetadata,
    sceneRecordsByStory: state.sceneRecordsByStory,
    sceneRecordHydration: state.sceneRecordHydration,
    currentStoryId: state.currentStoryId,
    playbackState: state.playbackState,
    settings: state.settings,
    aiBridgeSettings: state.aiBridgeSettings,
    saveSlots: state.saveSlots,
    audioLibraries: state.audioLibraries,
    characterLibraries: state.characterLibraries,
    language: state.language,
    mediaLibrary: getPersistableMediaLibrary(state.mediaLibrary),
    imageAssetIdsByStory: state.imageAssetIdsByStory,
    // Which endings a reader has reached is progress, not cache: losing it would
    // silently re-ask for a review and reset their collection.
    endingsReachedByStory: state.endingsReachedByStory,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function normalizeProvider(value: unknown, fallback: BridgeProvider): BridgeProvider {
  return value === 'claude' || value === 'openai' || value === 'codex' ? value : fallback;
}

function normalizeCodexConsent(value: unknown): CodexBetaConsent | undefined {
  if (!isRecord(value)
    || typeof value.acceptedAt !== 'string'
    || !Number.isFinite(Date.parse(value.acceptedAt))
    || typeof value.disclosureVersion !== 'number'
    || !Number.isInteger(value.disclosureVersion)
    || typeof value.isolationPolicyVersion !== 'number'
    || !Number.isInteger(value.isolationPolicyVersion)
    || typeof value.codexCliVersion !== 'string'
    || !value.codexCliVersion.trim()) return undefined;
  return {
    acceptedAt: value.acceptedAt,
    disclosureVersion: value.disclosureVersion,
    isolationPolicyVersion: value.isolationPolicyVersion,
    codexCliVersion: value.codexCliVersion,
  };
}

function normalizePlaybackState(playbackState: unknown): PlaybackState | null {
  if (!isRecord(playbackState)) {
    return null;
  }

  return {
    ...(playbackState as unknown as PlaybackState),
    variables: isRecord(playbackState.variables)
      ? { ...(playbackState.variables as PlaybackState['variables']) }
      : {},
  };
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
  const needsStoryImageMigration = !('imageAssetIdsByStory' in migrated);

  if ('mediaLibrary' in migrated) {
    migrated.mediaLibrary = getHydratableMediaLibrary(migrated.mediaLibrary);
  }
  if ('characterLibraries' in migrated) {
    migrated.characterLibraries = migrateCharacterLibraries(migrated.characterLibraries);
  }
  if ('sceneRecordsByStory' in migrated) {
    migrated.sceneRecordsByStory = migrateSceneRecordsByStory(migrated.sceneRecordsByStory);
  }
  migrated.imageAssetIdsByStory = migrateStoryImageAssetIds(
    migrated.imageAssetIdsByStory,
    migrated.sceneRecordsByStory ?? {},
    getHydratableMediaLibrary(migrated.mediaLibrary),
    needsStoryImageMigration,
  );
  if (Array.isArray(migrated.storiesMetadata)) {
    migrated.storiesMetadata = withCharacterSchemaVersion(migrated.storiesMetadata).map(
      normalizeStoryMetadata,
    );
  }
  if ('playbackState' in migrated) {
    migrated.playbackState = normalizePlaybackState(migrated.playbackState);
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
    aiBridgeSettings: isRecord(persisted.aiBridgeSettings)
      ? {
          url: typeof persisted.aiBridgeSettings.url === 'string' ? persisted.aiBridgeSettings.url : currentState.aiBridgeSettings.url,
          token: typeof persisted.aiBridgeSettings.token === 'string' ? persisted.aiBridgeSettings.token : currentState.aiBridgeSettings.token,
          disabled:
            typeof persisted.aiBridgeSettings.disabled === 'boolean'
              ? persisted.aiBridgeSettings.disabled
              : currentState.aiBridgeSettings.disabled,
          preferredProvider: normalizeProvider(
            persisted.aiBridgeSettings.preferredProvider,
            currentState.aiBridgeSettings.preferredProvider ?? 'openai',
          ),
          ...(normalizeCodexConsent(persisted.aiBridgeSettings.codexBetaConsent)
            ? { codexBetaConsent: normalizeCodexConsent(persisted.aiBridgeSettings.codexBetaConsent) }
            : {}),
        }
      : currentState.aiBridgeSettings,
    mediaLibrary:
      'mediaLibrary' in persisted
        ? getHydratableMediaLibrary(persisted.mediaLibrary)
        : currentState.mediaLibrary,
    imageAssetIdsByStory: migrateStoryImageAssetIds(
      'imageAssetIdsByStory' in persisted
        ? normalizeStoryImageAssetIds(persisted.imageAssetIdsByStory)
        : currentState.imageAssetIdsByStory,
      'sceneRecordsByStory' in persisted
        ? migrateSceneRecordsByStory(persisted.sceneRecordsByStory)
        : currentState.sceneRecordsByStory,
      'mediaLibrary' in persisted
        ? getHydratableMediaLibrary(persisted.mediaLibrary)
        : currentState.mediaLibrary,
      false,
    ),
    characterLibraries:
      'characterLibraries' in persisted
        ? migrateCharacterLibraries(persisted.characterLibraries)
        : currentState.characterLibraries,
    sceneRecordsByStory:
      'sceneRecordsByStory' in persisted
        ? migrateSceneRecordsByStory(persisted.sceneRecordsByStory)
        : currentState.sceneRecordsByStory,
    storiesMetadata: withCharacterSchemaVersion(
      Array.isArray(persisted.storiesMetadata)
        ? persisted.storiesMetadata
        : currentState.storiesMetadata,
    ).map(normalizeStoryMetadata),
    playbackState:
      'playbackState' in persisted
        ? normalizePlaybackState(persisted.playbackState)
        : currentState.playbackState,
    sceneRecordHydration: currentState.sceneRecordHydration,
  };
}
