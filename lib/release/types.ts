/**
 * Release container types.
 *
 * A `.vnerelease` is the `.vnebackup` container with a stricter contract: the
 * same `manifest.json` + `story.json` + content-addressed `objects/<sha256>`
 * layout (see `lib/story-backup/types.ts`), plus a `release` block that makes it
 * an immutable, versioned, publishable artifact rather than restorable author
 * state.
 *
 * The limits are imported rather than restated so a story that can be released
 * can always be archived too — two independently drifting sets of caps would
 * eventually let a release exist that no writer could package.
 */
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import { STORY_BACKUP_LIMITS } from '@/lib/story-backup/types';
import type { StoryMetadata } from '@/lib/story-domain';
import type { StoryReaderLayoutPreset, StoryReaderTheme } from '@/lib/story-theme';

export const RELEASE_FORMAT = 'vne-release' as const;
export const RELEASE_CONTAINER_VERSION = 1 as const;
export const RELEASE_SCHEMA_VERSION = 1 as const;

export const RELEASE_PATHS = {
  manifest: 'manifest.json',
  payload: 'story.json',
  objectPrefix: 'objects/',
} as const;

export const RELEASE_LIMITS = {
  ...STORY_BACKUP_LIMITS,
  /**
   * Advisory, not enforced here. Past this a release is still valid — it is
   * simply a bad web page on mobile data, and the author is told so. Hard
   * ceilings are per-channel and belong to the channel (see RELEASE-PLAN.md).
   */
  softWarnBytes: 150 * 1024 * 1024,
  maxCredits: 200,
  maxLanguages: 20,
  maxContentWarnings: 40,
  maxNotesLength: 4_000,
} as const;

/** Where a release is meant to be consumed. Both channels read the same file. */
export const RELEASE_CHANNELS = ['page', 'app', 'both'] as const;
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

export const CONTENT_RATINGS = ['everyone', 'teen', 'mature'] as const;
export type ContentRating = (typeof CONTENT_RATINGS)[number];

export interface ReleaseCredit {
  role: string;
  name: string;
  source?: string;
  licence?: string;
}

/** How the story presents itself; a frozen copy, not a pointer to live state. */
export interface ReleasePresentation {
  coverAssetId?: string;
  bannerEffect?: 'rain' | 'snow' | 'fog';
  theme?: StoryReaderTheme;
  readerLayoutPreset?: StoryReaderLayoutPreset;
}

/** Everything a store page has to answer before a reader commits. */
export interface ReleasePublication {
  author: string;
  languages: string[];
  contentRating: ContentRating;
  contentWarnings?: string[];
  licence?: string;
  credits?: ReleaseCredit[];
  aiAssisted?: boolean;
}

/** Computed from the story, never typed by hand. */
export interface ReleaseStats {
  scenes: number;
  words: number;
  readMinutes: number;
  endings: number;
  branches: number;
}

export interface ReleaseBlock {
  releaseId: string;
  storyId: string;
  /** Author-facing `MAJOR.MINOR.PATCH`; see `lib/release/version.ts`. */
  version: string;
  channel: ReleaseChannel;
  releasedAt: string;
  notes?: string;
  engineVersion: string;
  /** A player below this refuses to open the release rather than mis-playing it. */
  minEngineVersion: string;
  /** Mirrors `payload.sha256`; kept here so the block is self-contained. */
  payloadHash: string;
  presentation?: ReleasePresentation;
  publication: ReleasePublication;
  stats: ReleaseStats;
}

export interface ReleaseAsset {
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

export interface ReleaseManifestV1 {
  format: typeof RELEASE_FORMAT;
  containerVersion: typeof RELEASE_CONTAINER_VERSION;
  schemaVersion: typeof RELEASE_SCHEMA_VERSION;
  createdAt: string;
  appVersion: string;
  story: StoryMetadata;
  release: ReleaseBlock;
  counts: {
    scenes: number;
    characters: number;
    audioItems: number;
    embeddedAssets: number;
    totalAssetBytes: number;
  };
  payload: {
    archivePath: typeof RELEASE_PATHS.payload;
    sha256: string;
    size: number;
  };
  assets: ReleaseAsset[];
}

/**
 * The frozen story. Deliberately narrower than the backup payload: no
 * snapshots, no coverage, no media membership bookkeeping — the manifest's
 * asset table is the authoritative index of what ships.
 */
export interface ReleasePayloadV1 {
  scenes: Record<string, SceneRecord>;
  characters: Character[];
  audioLibrary: AudioLibraryItem[];
}

export interface ReleasePreview {
  story: StoryMetadata;
  release: ReleaseBlock;
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  counts: ReleaseManifestV1['counts'];
  mediaKinds: Record<string, number>;
  totalBytes: number;
}
