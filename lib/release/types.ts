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
import {
  CONTENT_RATINGS,
  MAX_STORY_CONTENT_WARNINGS,
  MAX_STORY_CREDITS,
  MAX_STORY_LANGUAGES,
  type ContentRating,
  type StoryCredit,
} from '@/lib/story-publication';
import type { StoryReaderLayoutPreset, StoryReaderTheme } from '@/lib/story-theme';

export { CONTENT_RATINGS, type ContentRating };

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
  // Shared with story metadata so a story the editor accepts can always be
  // released: a lower cap here would reject a story the author was allowed to
  // write.
  maxCredits: MAX_STORY_CREDITS,
  maxLanguages: MAX_STORY_LANGUAGES,
  maxContentWarnings: MAX_STORY_CONTENT_WARNINGS,
  maxNotesLength: 4_000,
} as const;

/**
 * The oldest engine that understands release schema v1. Bumped only when a
 * change makes an older reader mis-play a release rather than merely miss a
 * feature — refusing to open is worse than degrading, so the bar is high.
 *
 * Lives here rather than beside the compiler because it describes the *format*,
 * and readers need it without the compiler's dependencies: a Node tool that only
 * writes a container should not have to load the app's media layer to learn it.
 */
export const MIN_ENGINE_VERSION_FOR_RELEASE_V1 = '1.0.0';

/** Where a release is meant to be consumed. Both channels read the same file. */
export const RELEASE_CHANNELS = ['page', 'app', 'both'] as const;
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

/** A release credit is a story credit, frozen; the shape must not diverge. */
export type ReleaseCredit = StoryCredit;

/**
 * What a storefront needs that the rest of the manifest cannot supply, frozen
 * at release time.
 *
 * These three are all derived from the scenes, and a listing must not have to
 * open the story to draw a card: the showcase renders from the release, not
 * from the author's working copy. That is the whole point of freezing.
 */
export interface ReleaseShowcase {
  /** First lines of the opening scene, already trimmed for a card. */
  teaser: string | null;
  /** Background of the opening scene, for the hero banner. */
  bannerBackgroundAssetId: string | null;
  /** Scenes a playthrough can end on, so «endings seen» needs no scene load. */
  terminalSceneIds: string[];
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
  showcase: ReleaseShowcase;
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
