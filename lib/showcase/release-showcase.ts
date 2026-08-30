/**
 * The showcase, built from releases rather than from the author's working copy.
 *
 * This is the whole point of freezing: a reader browsing the shelf sees what
 * was published, and an author editing chapter nine changes nothing on it until
 * they publish again. `lib/showcase/story-showcase.ts` still describes drafts
 * for the studio; this describes what is out.
 *
 * A release carries its own storefront projection (`release.showcase`), so
 * drawing a card needs no scene load at all — only the manifest and the
 * reader's own progress.
 */
import type {
  ContentRating,
  ReleaseCredit,
  ReleaseManifestV1,
} from '@/lib/release/types';
import type {
  ShowcaseBannerEffect,
  ShowcaseProgressInput,
  ShowcaseStory,
} from '@/lib/showcase/story-showcase';

/**
 * Everything the shelf needs from one published release, flattened.
 *
 * Kept separate from the manifest because the manifest also carries an asset
 * table that can run to hundreds of entries, and the store caches this per
 * story. Derived once at load time.
 */
export interface ReleaseShowcaseSource {
  storyId: string;
  releaseId: string;
  version: string;
  releasedAt: string;
  notes?: string;
  title: string;
  author: string | null;
  coverUri: string | null;
  teaser: string | null;
  tags: string[];
  readMinutes: number;
  branchCount: number;
  bannerEffect: ShowcaseBannerEffect | null;
  bannerBackgroundAssetId: string | null;
  terminalSceneIds: string[];
  createdAt: number;
  updatedAt: number;
  /**
   * The publication facts a store page has to answer before a stranger starts
   * reading. Carried here so the page needs no second read of the manifest.
   */
  contentRating: ContentRating;
  languages: string[];
  contentWarnings: string[];
  licence: string | null;
  credits: ReleaseCredit[];
  /** Undefined means the author said nothing either way. */
  aiAssisted?: boolean;
}

export function releaseShowcaseSource(manifest: ReleaseManifestV1): ReleaseShowcaseSource {
  const { release, story } = manifest;
  const source: ReleaseShowcaseSource = {
    storyId: release.storyId,
    releaseId: release.releaseId,
    version: release.version,
    releasedAt: release.releasedAt,
    title: story.title,
    author: release.publication.author.trim() || null,
    coverUri: release.presentation?.coverAssetId ?? null,
    teaser: release.showcase.teaser,
    tags: Array.isArray(story.tags) ? story.tags.filter((tag) => typeof tag === 'string') : [],
    readMinutes: release.stats.readMinutes,
    branchCount: release.stats.branches,
    bannerEffect: release.presentation?.bannerEffect ?? null,
    bannerBackgroundAssetId: release.showcase.bannerBackgroundAssetId,
    terminalSceneIds: release.showcase.terminalSceneIds,
    createdAt: story.createdAt,
    // The release date, not the story's `updatedAt`: a shelf that reordered
    // itself while an author edited a draft would be reporting private work.
    updatedAt: Date.parse(release.releasedAt) || story.updatedAt,
    contentRating: release.publication.contentRating,
    languages: release.publication.languages,
    contentWarnings: release.publication.contentWarnings ?? [],
    licence: release.publication.licence ?? null,
    credits: release.publication.credits ?? [],
  };
  if (release.notes) source.notes = release.notes;
  if (release.publication.aiAssisted !== undefined) {
    source.aiAssisted = release.publication.aiAssisted;
  }
  return source;
}

export function buildShowcaseStoryFromRelease(
  source: ReleaseShowcaseSource,
  progress: ShowcaseProgressInput,
): ShowcaseStory {
  const terminals = new Set(source.terminalSceneIds);
  const endingsSeen = new Set(
    (progress.endingsReached ?? []).filter((sceneId) => terminals.has(sceneId)),
  ).size;
  const latestSave = progress.latestSave;

  return {
    id: source.storyId,
    title: source.title,
    author: source.author,
    coverUri: source.coverUri,
    teaser: source.teaser,
    tags: source.tags,
    readMinutes: source.readMinutes,
    // Same display floor as the draft showcase: a story that loops back to its
    // own beginning still stops somewhere for the reader.
    endingsTotal: Math.max(1, source.terminalSceneIds.length),
    endingsSeen,
    branchCount: source.branchCount,
    bannerEffect: source.bannerEffect,
    bannerBackgroundAssetId: source.bannerBackgroundAssetId,
    hasStarted: latestSave !== null,
    isFinished: endingsSeen > 0,
    lastSaveTimestamp: latestSave?.timestamp ?? null,
    lastSceneId: latestSave?.sceneId ?? null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}
