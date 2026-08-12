import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';

export const STORY_BACKUP_FORMAT = 'vne-story-backup' as const;
export const STORY_BACKUP_CONTAINER_VERSION = 1 as const;
export const STORY_BACKUP_SCHEMA_VERSION = 1 as const;

export const STORY_BACKUP_PATHS = {
  manifest: 'manifest.json',
  payload: 'story.json',
  objectPrefix: 'objects/',
} as const;

export const STORY_BACKUP_LIMITS = {
  maxEntries: 10_000,
  maxManifestBytes: 16 * 1024 * 1024,
  maxPayloadBytes: 64 * 1024 * 1024,
  maxObjectBytes: 64 * 1024 * 1024,
  maxWebUncompressedBytes: 512 * 1024 * 1024,
  maxNativeUncompressedBytes: 1024 * 1024 * 1024,
  maxCompressionRatio: 100,
} as const;

export interface StoryBackupAsset {
  assetId: string;
  sourceReferences: string[];
  sha256: string;
  size: number;
  kind: string;
  mimeType: string;
  originalName: string;
  originalExtension?: string;
  archivePath: `objects/${string}`;
}

export interface StoryArchiveManifestV1 {
  format: typeof STORY_BACKUP_FORMAT;
  containerVersion: typeof STORY_BACKUP_CONTAINER_VERSION;
  schemaVersion: typeof STORY_BACKUP_SCHEMA_VERSION;
  createdAt: string;
  appVersion: string;
  story: StoryMetadata;
  counts: {
    scenes: number;
    characters: number;
    audioItems: number;
    embeddedAssets: number;
    totalAssetBytes: number;
  };
  payload: {
    archivePath: typeof STORY_BACKUP_PATHS.payload;
    sha256: string;
    size: number;
  };
  assets: StoryBackupAsset[];
}

export interface StoryArchivePayloadV1 {
  scenes: Record<string, SceneRecord>;
  characters: Character[];
  audioLibrary: AudioLibraryItem[];
  mediaMembershipIds: string[];
}

export interface StoryArchivePreview {
  story: StoryMetadata;
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  counts: StoryArchiveManifestV1['counts'];
  mediaKinds: Record<string, number>;
}

export interface StoryArchiveBinarySource {
  readonly size?: number;
  open(): AsyncIterable<Uint8Array>;
}

export interface StoryArchiveBinarySink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(reason: unknown): Promise<void>;
}

export interface PreparedStoryBackupAsset {
  metadata: StoryBackupAsset;
  source: StoryArchiveBinarySource;
}
