import { Platform } from 'react-native';

import { binaryFromBlob, binaryFromBytes, type BackupBinary } from '@/lib/backup-binary';
import {
  isPortableAssetUri,
  type BackupAsset,
  type BackupData,
  type BackupManifest,
  type LocalBackupAsset,
  type LocalRepository,
  type StagedBackupAsset,
} from '@/lib/backup-service';
import {
  createMediaBlobUri,
  deleteMediaBlob,
  getMediaBlob,
  getMediaBlobStorageKey,
  hasMediaBlob,
  putMediaBlob,
} from '@/lib/idb-storage';
import type { LibraryAsset } from '@/lib/media-library-service';
import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  loadSceneRecordsForStory,
  type SceneRecordStorageLike,
  type SceneRecordsByStory,
} from '@/lib/scene-record-storage';
import type { AppState } from '@/stores/app-store-types';
import { persistAppStoreStateNow, useAppStore } from '@/stores/use-app-store';

function mimeTypeFor(asset: LibraryAsset): string {
  const extension = asset.name.split('.').pop()?.toLowerCase()
    ?? asset.uri.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    gif: 'image/gif', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
  };
  return (extension && types[extension]) || (asset.type === 'audio' ? 'audio/mpeg' : 'image/png');
}

function extensionFor(mimeType: string): string {
  return ({
    'image/gif': 'gif', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp4': 'm4a',
  } as Record<string, string>)[mimeType] ?? 'bin';
}

/**
 * Scene records are not held in the store.
 *
 * The persist envelope is compacted to `sceneRecordsByStory: {}` and every
 * story's records are written to their own key, so after a cold start the store
 * map is empty. It fills lazily, and only a story marked `'full'` in
 * `sceneRecordHydration` has all of its scenes in memory — a reader window
 * holds about five of them, and an unopened story holds none. Reading the raw
 * store map would therefore back up truncated stories, which `activateBackup`
 * would then write back as authoritative.
 */
async function captureSceneRecords(
  storage: SceneRecordStorageLike,
  state: AppState,
): Promise<SceneRecordsByStory> {
  const entries = await Promise.all(state.storiesMetadata.map(async (story) => [
    story.id,
    state.sceneRecordHydration[story.id] === 'full'
      ? state.sceneRecordsByStory[story.id] ?? {}
      : await loadSceneRecordsForStory(storage, story.id),
  ] as const));

  return Object.fromEntries(entries);
}

async function readAssetBinary(asset: LibraryAsset): Promise<BackupBinary> {
  const idbKey = getMediaBlobStorageKey(asset.uri);
  if (idbKey) {
    const blob = await getMediaBlob(idbKey);
    if (!blob) throw new Error(`Missing local backup asset: ${asset.id}`);
    return binaryFromBlob(blob, blob.type || mimeTypeFor(asset));
  }

  if (Platform.OS !== 'web' && asset.uri.startsWith('file:')) {
    const { File } = await import('expo-file-system');
    const file = new File(asset.uri);
    if (!file.exists) throw new Error(`Missing local backup asset: ${asset.id}`);
    return binaryFromBytes(await file.bytes(), file.type || mimeTypeFor(asset));
  }

  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error(`Cannot read local backup asset: ${asset.id}`);
  return binaryFromBlob(await response.blob(), mimeTypeFor(asset));
}

async function stageAsset(
  backupId: string,
  asset: BackupAsset,
  binary: BackupBinary,
): Promise<StagedBackupAsset> {
  if (Platform.OS === 'web') {
    const storageKey = `restore-${backupId}-${asset.sha256}`;
    await putMediaBlob(storageKey, new Blob([await binary.bytes()], { type: asset.mimeType }));
    return { ...asset, stagedUri: createMediaBlobUri(storageKey) };
  }

  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.cache, 'vne-restore', backupId);
  if (!directory.exists) directory.create({ intermediates: true });
  const file = new File(directory, `${asset.sha256}.${extensionFor(asset.mimeType)}`);
  file.create({ overwrite: true });
  file.write(await binary.bytes());
  if (file.size !== asset.size) {
    file.delete();
    throw new Error(`Cannot verify staged restore asset: ${asset.assetId}`);
  }
  return { ...asset, stagedUri: file.uri };
}

async function promoteAssets(assets: StagedBackupAsset[]): Promise<Map<string, string>> {
  const uris = new Map<string, string>();

  if (Platform.OS === 'web') {
    for (const asset of assets) {
      const stagedKey = getMediaBlobStorageKey(asset.stagedUri);
      const blob = stagedKey ? await getMediaBlob(stagedKey) : null;
      if (!blob) throw new Error(`Missing staged restore asset: ${asset.assetId}`);
      if (!await hasMediaBlob(asset.sha256)) await putMediaBlob(asset.sha256, blob);
      uris.set(asset.assetId, createMediaBlobUri(asset.sha256));
    }
    return uris;
  }

  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.document, 'media-library', 'restored');
  if (!directory.exists) directory.create({ intermediates: true });
  for (const asset of assets) {
    const staged = new File(asset.stagedUri);
    const target = new File(directory, `${asset.sha256}.${extensionFor(asset.mimeType)}`);
    if (target.exists) staged.delete();
    else staged.move(target);
    uris.set(asset.assetId, target.uri);
  }
  return uris;
}

async function discardStagedAssets(assets: StagedBackupAsset[]): Promise<void> {
  if (Platform.OS === 'web') {
    await Promise.all(assets.map((asset) => {
      const key = getMediaBlobStorageKey(asset.stagedUri);
      return key ? deleteMediaBlob(key) : Promise.resolve();
    }));
    return;
  }

  const { File } = await import('expo-file-system');
  for (const asset of assets) {
    const file = new File(asset.stagedUri);
    if (file.exists) file.delete();
  }
}

export function createAppLocalRepository(
  storage: SceneRecordStorageLike = createPersistentStorage() as SceneRecordStorageLike,
): LocalRepository {
  const assetsById = () =>
    new Map(useAppStore.getState().mediaLibrary.map((asset) => [asset.id, asset]));

  return {
    async captureBackupData(): Promise<BackupData> {
      const state = useAppStore.getState();
      const scenes = await captureSceneRecords(storage, state);
      return structuredClone({
        stories: state.storiesMetadata,
        scenes,
        libraries: {
          characters: state.characterLibraries,
          audio: state.audioLibraries,
          imageAssetIdsByStory: state.imageAssetIdsByStory,
          media: state.mediaLibrary,
        },
      });
    },

    async listBackupAssets(): Promise<LocalBackupAsset[]> {
      const assets = useAppStore.getState().mediaLibrary
        .filter((asset) => !isPortableAssetUri(asset.uri));

      return Promise.all(assets.map(async (asset) => {
        const binary = await readAssetBinary(asset);
        return {
          assetId: asset.id,
          storageKey: getMediaBlobStorageKey(asset.uri) ?? asset.id,
          mimeType: binary.mimeType,
          size: binary.size,
        };
      }));
    },

    async getAssetBinary(assetId: string): Promise<BackupBinary> {
      const asset = assetsById().get(assetId);
      if (!asset) throw new Error(`Unknown local backup asset: ${assetId}`);
      return readAssetBinary(asset);
    },

    stageBackupAsset: stageAsset,

    async activateBackup(
      manifest: BackupManifest,
      stagedAssets: StagedBackupAsset[],
    ): Promise<void> {
      const before = useAppStore.getState();
      for (const story of before.storiesMetadata) {
        await before.createStorySnapshot(story.id, 'Before cloud restore', true);
      }

      // Rolling back needs the *complete* pre-restore scene set, not the store's
      // partial view — otherwise a failed restore would leave windowed stories
      // holding whatever the manifest wrote.
      const current = useAppStore.getState();
      const previous = structuredClone({
        storiesMetadata: current.storiesMetadata,
        sceneRecordsByStory: await captureSceneRecords(storage, current),
        sceneRecordHydration: Object.fromEntries(
          current.storiesMetadata.map((story) => [story.id, 'full' as const]),
        ),
        characterLibraries: current.characterLibraries,
        audioLibraries: current.audioLibraries,
        imageAssetIdsByStory: current.imageAssetIdsByStory,
        mediaLibrary: current.mediaLibrary,
        currentStoryId: current.currentStoryId,
        playbackState: current.playbackState,
      });

      const assetUris = await promoteAssets(stagedAssets);
      const mediaLibrary = manifest.libraries.media.map((asset) => ({
        ...asset,
        uri: assetUris.get(asset.id) ?? asset.uri,
      }));
      const nextStoryId = manifest.stories.some((story) => story.id === current.currentStoryId)
        ? current.currentStoryId
        : manifest.stories[0]?.id ?? null;

      useAppStore.setState({
        storiesMetadata: structuredClone(manifest.stories),
        sceneRecordsByStory: structuredClone(manifest.scenes),
        sceneRecordHydration: Object.fromEntries(
          manifest.stories.map((story) => [story.id, 'full' as const]),
        ),
        characterLibraries: structuredClone(manifest.libraries.characters),
        audioLibraries: structuredClone(manifest.libraries.audio),
        imageAssetIdsByStory: structuredClone(manifest.libraries.imageAssetIdsByStory),
        mediaLibrary,
        currentStoryId: nextStoryId,
        playbackState: null,
      });

      try {
        await persistAppStoreStateNow();
      } catch (error) {
        useAppStore.setState(previous);
        await persistAppStoreStateNow().catch(() => undefined);
        throw error;
      }
      await discardStagedAssets(stagedAssets).catch(() => undefined);
    },

    async discardStagedBackup(
      _backupId: string,
      stagedAssets: StagedBackupAsset[],
    ): Promise<void> {
      await discardStagedAssets(stagedAssets);
    },
  };
}
