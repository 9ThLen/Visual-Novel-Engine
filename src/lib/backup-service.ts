import type { BackupBinary } from '@/lib/backup-binary';
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import { generateId } from '@/lib/id-utils';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { StoryMetadata } from '@/lib/story-domain';
import type { StoryImageAssetIds } from '@/lib/story-image-library';

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupData {
  stories: StoryMetadata[];
  scenes: Record<string, Record<string, SceneRecord>>;
  libraries: {
    characters: Record<string, Character[]>;
    audio: Record<string, AudioLibraryItem[]>;
    imageAssetIdsByStory: StoryImageAssetIds;
    media: LibraryAsset[];
  };
}

export interface LocalBackupAsset {
  assetId: string;
  storageKey: string;
  mimeType: string;
  size: number;
}

export interface BackupAsset extends LocalBackupAsset {
  sha256: string;
}

export interface BackupManifest extends BackupData {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  backupId: string;
  createdAt: string;
  appVersion: string;
  assets: BackupAsset[];
}

export interface StagedBackupAsset extends BackupAsset {
  stagedUri: string;
}

/**
 * Media that restores from its own source — app-bundled assets and remote URLs.
 * These carry no bytes into the backup: uploading them would be pointless, and
 * demanding bytes for them would make every backup of a bundled demo story fail.
 */
export function isPortableAssetUri(uri: string): boolean {
  return /^(assets\/|bundle:\/\/)/.test(uri);
}

/** Platform seam: implementations read IDB on web and FileSystem on native. */
export interface LocalRepository {
  captureBackupData(): Promise<BackupData>;
  listBackupAssets(): Promise<LocalBackupAsset[]>;
  getAssetBinary(assetId: string): Promise<BackupBinary>;
  stageBackupAsset(
    backupId: string,
    asset: BackupAsset,
    binary: BackupBinary,
  ): Promise<StagedBackupAsset>;
  activateBackup(manifest: BackupManifest, assets: StagedBackupAsset[]): Promise<void>;
  discardStagedBackup(backupId: string, assets: StagedBackupAsset[]): Promise<void>;
}

/** Cloud-specific implementations belong to Phase 7. */
export interface BackupTransport {
  hasAsset(sha256: string): Promise<boolean>;
  uploadAsset(asset: BackupAsset, binary: BackupBinary): Promise<void>;
  uploadManifest(manifest: BackupManifest): Promise<void>;
  markComplete(manifest: BackupManifest): Promise<void>;
  downloadManifest(backupId: string): Promise<unknown>;
  downloadAsset(asset: BackupAsset): Promise<BackupBinary>;
}

export interface BackupServiceDependencies {
  repository: LocalRepository;
  transport: BackupTransport;
  sha256(binary: BackupBinary): Promise<string>;
  appVersion: string;
  now?: () => Date;
  createBackupId?: () => string;
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`Invalid backup ${field}`);
}

function assertBackupId(value: string): void {
  assertNonEmpty(value, 'backupId');
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid backup backupId');
}

export function validateBackupManifest(value: unknown): asserts value is BackupManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid backup manifest');
  }
  const manifest = value as Partial<BackupManifest>;
  if (manifest.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported backup schema version: ${String(manifest.schemaVersion)}`);
  }
  if (typeof manifest.backupId !== 'string' || typeof manifest.createdAt !== 'string'
    || typeof manifest.appVersion !== 'string') {
    throw new Error('Invalid backup manifest metadata');
  }
  assertBackupId(manifest.backupId);
  assertNonEmpty(manifest.appVersion, 'appVersion');
  if (!Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('Invalid backup createdAt');
  if (!Array.isArray(manifest.stories) || !manifest.scenes || typeof manifest.scenes !== 'object'
    || Array.isArray(manifest.scenes)
    || !manifest.libraries || typeof manifest.libraries !== 'object'
    || !Array.isArray(manifest.libraries.media)
    || !manifest.libraries.characters || typeof manifest.libraries.characters !== 'object'
    || !manifest.libraries.audio || typeof manifest.libraries.audio !== 'object'
    || !manifest.libraries.imageAssetIdsByStory
    || typeof manifest.libraries.imageAssetIdsByStory !== 'object'
    || !Array.isArray(manifest.assets)) {
    throw new Error('Invalid backup manifest data');
  }
  const assetIds = new Set<string>();
  for (const asset of manifest.assets) {
    if (!asset || typeof asset !== 'object' || typeof asset.assetId !== 'string'
      || typeof asset.storageKey !== 'string' || typeof asset.sha256 !== 'string'
      || typeof asset.mimeType !== 'string' || typeof asset.size !== 'number'
      || asset.size <= 0 || !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
      throw new Error('Invalid backup asset');
    }
    if (assetIds.has(asset.assetId)) throw new Error(`Duplicate backup asset: ${asset.assetId}`);
    assetIds.add(asset.assetId);
  }
  const mediaIds = new Set(manifest.libraries.media.map((asset) => asset.id));
  if (mediaIds.size !== manifest.libraries.media.length) {
    throw new Error('Duplicate backup media entry');
  }
  for (const assetId of assetIds) {
    if (!mediaIds.has(assetId)) throw new Error(`Backup asset has no media entry: ${assetId}`);
  }
  for (const media of manifest.libraries.media) {
    if (!isPortableAssetUri(media.uri) && !assetIds.has(media.id)) {
      throw new Error(`Backup is missing bytes for media: ${media.id}`);
    }
  }

  // Scene records live outside the store (see captureBackupData). A story whose
  // scenes were never loaded would otherwise back up — and restore — as empty.
  const storyIds = new Set<string>();
  for (const story of manifest.stories) {
    if (!story || typeof story.id !== 'string' || !story.id) {
      throw new Error('Invalid backup story');
    }
    if (storyIds.has(story.id)) throw new Error(`Duplicate backup story: ${story.id}`);
    storyIds.add(story.id);
    if (!Object.prototype.hasOwnProperty.call(manifest.scenes, story.id)) {
      throw new Error(`Backup is missing scenes for story: ${story.id}`);
    }
  }
  for (const [storyId, scenes] of Object.entries(manifest.scenes)) {
    if (!storyIds.has(storyId)) throw new Error(`Backup scenes reference unknown story: ${storyId}`);
    if (!scenes || typeof scenes !== 'object' || Array.isArray(scenes)) {
      throw new Error(`Invalid backup scenes for story: ${storyId}`);
    }
    for (const [sceneId, scene] of Object.entries(scenes)) {
      if (!scene || typeof scene !== 'object'
        || scene.id !== sceneId || scene.storyId !== storyId) {
        throw new Error(`Invalid backup scene: ${storyId}/${sceneId}`);
      }
    }
  }
}

export class BackupService {
  constructor(private readonly dependencies: BackupServiceDependencies) {}

  async createBackup(): Promise<BackupManifest> {
    const { repository, transport, sha256, appVersion } = this.dependencies;
    assertNonEmpty(appVersion, 'appVersion');
    const [data, localAssets] = await Promise.all([
      repository.captureBackupData(),
      repository.listBackupAssets(),
    ]);
    const assets: BackupAsset[] = [];

    for (const localAsset of localAssets) {
      const binary = await repository.getAssetBinary(localAsset.assetId);
      if (binary.size !== localAsset.size) {
        throw new Error(`Backup asset size changed: ${localAsset.assetId}`);
      }
      const asset = { ...localAsset, sha256: await sha256(binary) };
      if (!await transport.hasAsset(asset.sha256)) await transport.uploadAsset(asset, binary);
      assets.push(asset);
    }

    const manifest: BackupManifest = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      backupId: this.dependencies.createBackupId?.() ?? generateId('backup'),
      createdAt: (this.dependencies.now?.() ?? new Date()).toISOString(),
      appVersion,
      ...data,
      assets,
    };
    validateBackupManifest(manifest);
    await transport.uploadManifest(manifest);
    await transport.markComplete(manifest);
    return manifest;
  }

  async restoreBackup(backupId: string): Promise<BackupManifest> {
    assertBackupId(backupId);
    const { repository, transport, sha256 } = this.dependencies;
    const manifestValue = await transport.downloadManifest(backupId);
    validateBackupManifest(manifestValue);
    if (manifestValue.backupId !== backupId) throw new Error('Backup manifest ID mismatch');

    const stagedAssets: StagedBackupAsset[] = [];
    try {
      for (const asset of manifestValue.assets) {
        const binary = await transport.downloadAsset(asset);
        if (binary.size !== asset.size) {
          throw new Error(`Restore asset size mismatch: ${asset.assetId}`);
        }
        if (await sha256(binary) !== asset.sha256) {
          throw new Error(`Restore asset hash mismatch: ${asset.assetId}`);
        }
        stagedAssets.push(await repository.stageBackupAsset(backupId, asset, binary));
      }
      await repository.activateBackup(manifestValue, stagedAssets);
      return manifestValue;
    } catch (error) {
      await repository.discardStagedBackup(backupId, stagedAssets).catch(() => undefined);
      throw error;
    }
  }
}
