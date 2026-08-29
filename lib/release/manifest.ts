/**
 * Release manifest parsing and validation.
 *
 * Every field is checked structurally and every failure names what was wrong:
 * a manifest arrives from a file someone else produced, so "invalid release" is
 * never a useful thing to tell an author.
 *
 * The validators are local rather than shared with `lib/story-backup/manifest.ts`.
 * They look alike today, but a release is a stricter contract than a backup and
 * coupling the two would mean every future tightening here loosens or breaks
 * restore. The duplication is a few small functions; the coupling would be
 * permanent.
 */
import {
  compareReleaseVersions,
  isReleaseVersion,
} from '@/lib/release/version';
import {
  CONTENT_RATINGS,
  RELEASE_CHANNELS,
  RELEASE_CONTAINER_VERSION,
  RELEASE_FORMAT,
  RELEASE_LIMITS,
  RELEASE_PATHS,
  RELEASE_SCHEMA_VERSION,
  type ContentRating,
  type ReleaseAsset,
  type ReleaseBlock,
  type ReleaseChannel,
  type ReleaseCredit,
  type ReleaseManifestV1,
  type ReleasePayloadV1,
  type ReleasePresentation,
  type ReleasePreview,
  type ReleasePublication,
  type ReleaseShowcase,
  type ReleaseStats,
} from '@/lib/release/types';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const OBJECT_PATH_PATTERN = /^objects\/([a-f0-9]{64})$/;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const BANNER_EFFECTS = ['rain', 'snow', 'fog'] as const;

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid release ${label}`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid release ${label}`);
  return value;
}

function requireSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Invalid release ${label}`);
  }
  return value as number;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`Invalid release ${label}`);
  }
  return Array.from(new Set(value as string[]));
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireString(value, label);
}

function requireVersion(value: unknown, label: string): string {
  const version = requireString(value, label);
  if (!isReleaseVersion(version)) throw new Error(`Invalid release ${label}`);
  return version;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Invalid release ${label}`);
  }
  return value as T;
}

function requireIsoDate(value: unknown, label: string): string {
  const raw = requireString(value, label);
  if (Number.isNaN(Date.parse(raw))) throw new Error(`Invalid release ${label}`);
  return raw;
}

function parseCredit(value: unknown): ReleaseCredit {
  const credit = requireObject(value, 'credit');
  const parsed: ReleaseCredit = {
    role: requireString(credit.role, 'credit role'),
    name: requireString(credit.name, 'credit name'),
  };
  const source = optionalString(credit.source, 'credit source');
  if (source !== undefined) parsed.source = source;
  const licence = optionalString(credit.licence, 'credit licence');
  if (licence !== undefined) parsed.licence = licence;
  return parsed;
}

function parsePublication(value: unknown): ReleasePublication {
  const publication = requireObject(value, 'publication');

  const languages = requireStringArray(publication.languages, 'languages');
  if (!languages.length) throw new Error('Invalid release languages');
  if (languages.length > RELEASE_LIMITS.maxLanguages) throw new Error('Release declares too many languages');
  for (const language of languages) {
    if (!LANGUAGE_PATTERN.test(language)) throw new Error(`Invalid release language: ${language}`);
  }

  const parsed: ReleasePublication = {
    author: requireString(publication.author, 'author'),
    languages,
    contentRating: requireOneOf<ContentRating>(
      publication.contentRating,
      CONTENT_RATINGS,
      'content rating',
    ),
  };

  if (publication.contentWarnings !== undefined) {
    const warnings = requireStringArray(publication.contentWarnings, 'content warnings');
    if (warnings.length > RELEASE_LIMITS.maxContentWarnings) {
      throw new Error('Release declares too many content warnings');
    }
    parsed.contentWarnings = warnings;
  }

  const licence = optionalString(publication.licence, 'licence');
  if (licence !== undefined) parsed.licence = licence;

  if (publication.credits !== undefined) {
    if (!Array.isArray(publication.credits)) throw new Error('Invalid release credits');
    if (publication.credits.length > RELEASE_LIMITS.maxCredits) {
      throw new Error('Release declares too many credits');
    }
    parsed.credits = publication.credits.map(parseCredit);
  }

  if (publication.aiAssisted !== undefined) {
    if (typeof publication.aiAssisted !== 'boolean') throw new Error('Invalid release AI disclosure');
    parsed.aiAssisted = publication.aiAssisted;
  }

  return parsed;
}

function parsePresentation(value: unknown): ReleasePresentation {
  const presentation = requireObject(value, 'presentation');
  const parsed: ReleasePresentation = {};

  const coverAssetId = optionalString(presentation.coverAssetId, 'cover asset');
  if (coverAssetId !== undefined) parsed.coverAssetId = coverAssetId;

  if (presentation.bannerEffect !== undefined) {
    parsed.bannerEffect = requireOneOf(presentation.bannerEffect, BANNER_EFFECTS, 'banner effect');
  }

  // Theme and layout are validated by their own normalizers at the point of use
  // (`lib/story-theme.ts`); carrying them through unread would let a malformed
  // theme reach a reader, so they are shape-checked here and normalized there.
  if (presentation.theme !== undefined) {
    parsed.theme = requireObject(presentation.theme, 'theme') as ReleasePresentation['theme'];
  }
  const layout = optionalString(presentation.readerLayoutPreset, 'reader layout');
  if (layout !== undefined) {
    parsed.readerLayoutPreset = layout as ReleasePresentation['readerLayoutPreset'];
  }

  return parsed;
}

function parseStats(value: unknown): ReleaseStats {
  const stats = requireObject(value, 'stats');
  return {
    scenes: requireSafeInteger(stats.scenes, 'scene stat'),
    words: requireSafeInteger(stats.words, 'word stat'),
    readMinutes: requireSafeInteger(stats.readMinutes, 'reading time stat'),
    endings: requireSafeInteger(stats.endings, 'ending stat'),
    branches: requireSafeInteger(stats.branches, 'branch stat'),
  };
}

function parseShowcase(value: unknown): ReleaseShowcase {
  const showcase = requireObject(value, 'showcase');
  const parsed: ReleaseShowcase = {
    teaser: showcase.teaser === null || showcase.teaser === undefined
      ? null
      : requireString(showcase.teaser, 'teaser'),
    bannerBackgroundAssetId: showcase.bannerBackgroundAssetId === null
      || showcase.bannerBackgroundAssetId === undefined
      ? null
      : requireString(showcase.bannerBackgroundAssetId, 'banner background'),
    terminalSceneIds: Array.isArray(showcase.terminalSceneIds)
      ? requireStringArray(showcase.terminalSceneIds, 'terminal scenes')
      : [],
  };
  return parsed;
}

function parseReleaseBlock(value: unknown): ReleaseBlock {
  const release = requireObject(value, 'release block');

  const engineVersion = requireVersion(release.engineVersion, 'engine version');
  const minEngineVersion = requireVersion(release.minEngineVersion, 'minimum engine version');
  if (compareReleaseVersions(minEngineVersion, engineVersion) > 0) {
    throw new Error('Release requires a newer engine than the one that built it');
  }

  const payloadHash = requireString(release.payloadHash, 'payload hash').toLowerCase();
  if (!SHA256_PATTERN.test(payloadHash)) throw new Error('Invalid release payload hash');

  const parsed: ReleaseBlock = {
    releaseId: requireString(release.releaseId, 'release ID'),
    storyId: requireString(release.storyId, 'story ID'),
    version: requireVersion(release.version, 'version'),
    channel: requireOneOf<ReleaseChannel>(release.channel, RELEASE_CHANNELS, 'channel'),
    releasedAt: requireIsoDate(release.releasedAt, 'release date'),
    engineVersion,
    minEngineVersion,
    payloadHash,
    publication: parsePublication(release.publication),
    stats: parseStats(release.stats),
    showcase: parseShowcase(release.showcase),
  };

  if (release.notes !== undefined) {
    const notes = requireString(release.notes, 'release notes');
    if (notes.length > RELEASE_LIMITS.maxNotesLength) throw new Error('Release notes are too long');
    parsed.notes = notes;
  }
  if (release.presentation !== undefined) {
    parsed.presentation = parsePresentation(release.presentation);
  }

  return parsed;
}

function parseAsset(value: unknown): ReleaseAsset {
  const asset = requireObject(value, 'asset');
  const sha256 = requireString(asset.sha256, 'asset hash').toLowerCase();
  const archivePath = requireString(asset.archivePath, 'asset path');
  const match = OBJECT_PATH_PATTERN.exec(archivePath);
  if (!SHA256_PATTERN.test(sha256) || match?.[1] !== sha256) {
    throw new Error('Invalid release asset path or hash');
  }

  const parsed: ReleaseAsset = {
    assetId: requireString(asset.assetId, 'asset ID'),
    sourceReferences: requireStringArray(asset.sourceReferences, 'asset references'),
    sha256,
    size: requireSafeInteger(asset.size, 'asset size'),
    kind: requireString(asset.kind, 'asset kind'),
    mimeType: requireString(asset.mimeType, 'asset MIME'),
    originalName: requireString(asset.originalName, 'asset name'),
    archivePath: archivePath as ReleaseAsset['archivePath'],
  };
  const extension = optionalString(asset.originalExtension, 'asset extension');
  if (extension !== undefined) parsed.originalExtension = extension;
  return parsed;
}

/**
 * Parse and validate a raw `manifest.json`. Throws with a specific message on
 * the first problem found.
 */
export function parseReleaseManifest(value: unknown): ReleaseManifestV1 {
  const manifest = requireObject(value, 'manifest');
  if (manifest.format !== RELEASE_FORMAT) throw new Error('Not a VNE release');
  if (manifest.containerVersion !== RELEASE_CONTAINER_VERSION) {
    throw new Error(`Unsupported release container version: ${String(manifest.containerVersion)}`);
  }
  if (manifest.schemaVersion !== RELEASE_SCHEMA_VERSION) {
    throw new Error(`Unsupported release schema version: ${String(manifest.schemaVersion)}`);
  }

  const story = requireObject(manifest.story, 'story');
  const storyId = requireString(story.id, 'story ID');
  requireString(story.title, 'story title');
  requireString(story.startSceneId, 'start scene');

  const release = parseReleaseBlock(manifest.release);
  if (release.storyId !== storyId) {
    throw new Error('Release block and story metadata disagree about the story ID');
  }

  const counts = requireObject(manifest.counts, 'counts');
  const payload = requireObject(manifest.payload, 'payload descriptor');
  const payloadHash = requireString(payload.sha256, 'payload hash').toLowerCase();
  if (payload.archivePath !== RELEASE_PATHS.payload || !SHA256_PATTERN.test(payloadHash)) {
    throw new Error('Invalid release payload descriptor');
  }
  if (payloadHash !== release.payloadHash) {
    throw new Error('Release block and payload descriptor disagree about the payload hash');
  }

  if (!Array.isArray(manifest.assets)) throw new Error('Invalid release assets');
  if (manifest.assets.length > RELEASE_LIMITS.maxEntries - 2) {
    throw new Error('Release has too many entries');
  }
  const assets = manifest.assets.map(parseAsset);

  const assetIds = new Set<string>();
  const referenceOwners = new Map<string, string>();
  const objectSizes = new Map<string, number>();
  for (const asset of assets) {
    if (assetIds.has(asset.assetId)) throw new Error(`Duplicate release asset ID: ${asset.assetId}`);
    assetIds.add(asset.assetId);

    const objectSize = objectSizes.get(asset.sha256);
    if (objectSize !== undefined && objectSize !== asset.size) {
      throw new Error(`Inconsistent release object size: ${asset.sha256}`);
    }
    objectSizes.set(asset.sha256, asset.size);

    for (const reference of new Set([asset.assetId, ...asset.sourceReferences])) {
      const owner = referenceOwners.get(reference);
      if (owner && owner !== asset.assetId) {
        throw new Error(`Ambiguous release media reference: ${reference}`);
      }
      referenceOwners.set(reference, asset.assetId);
    }
  }

  const parsed: ReleaseManifestV1 = {
    format: RELEASE_FORMAT,
    containerVersion: RELEASE_CONTAINER_VERSION,
    schemaVersion: RELEASE_SCHEMA_VERSION,
    createdAt: requireIsoDate(manifest.createdAt, 'creation date'),
    appVersion: requireString(manifest.appVersion, 'app version'),
    story: structuredClone(story) as unknown as ReleaseManifestV1['story'],
    release,
    counts: {
      scenes: requireSafeInteger(counts.scenes, 'scene count'),
      characters: requireSafeInteger(counts.characters, 'character count'),
      audioItems: requireSafeInteger(counts.audioItems, 'audio count'),
      embeddedAssets: requireSafeInteger(counts.embeddedAssets, 'asset count'),
      totalAssetBytes: requireSafeInteger(counts.totalAssetBytes, 'asset byte count'),
    },
    payload: {
      archivePath: RELEASE_PATHS.payload,
      sha256: payloadHash,
      size: requireSafeInteger(payload.size, 'payload size'),
    },
    assets,
  };

  if (parsed.payload.size > RELEASE_LIMITS.maxPayloadBytes) {
    throw new Error('Release payload is too large');
  }
  if (assets.some((asset) => asset.size > RELEASE_LIMITS.maxObjectBytes)) {
    throw new Error('Release object is too large');
  }
  if (parsed.counts.embeddedAssets !== assets.length) {
    throw new Error('Release asset count does not match manifest');
  }
  if (parsed.counts.totalAssetBytes !== assets.reduce((total, asset) => total + asset.size, 0)) {
    throw new Error('Release asset size does not match manifest');
  }
  if (parsed.counts.scenes !== parsed.release.stats.scenes) {
    throw new Error('Release scene count does not match its stats');
  }

  return parsed;
}

export function parseReleasePayload(value: unknown): ReleasePayloadV1 {
  const payload = requireObject(value, 'payload');
  const scenes = requireObject(payload.scenes, 'scenes');
  if (!Object.keys(scenes).length) throw new Error('Release payload has no scenes');
  if (!Array.isArray(payload.characters)) throw new Error('Invalid release characters');
  if (!Array.isArray(payload.audioLibrary)) throw new Error('Invalid release audio library');
  return structuredClone({
    scenes,
    characters: payload.characters,
    audioLibrary: payload.audioLibrary,
  }) as unknown as ReleasePayloadV1;
}

/**
 * Whether a given engine build may open this release. Separate from parsing:
 * a manifest can be perfectly valid and still be too new for the reader holding
 * it, and those two failures need different messages.
 */
export function isReleasePlayableBy(manifest: ReleaseManifestV1, engineVersion: string): boolean {
  if (!isReleaseVersion(engineVersion)) return false;
  return compareReleaseVersions(engineVersion, manifest.release.minEngineVersion) >= 0;
}

export function buildReleasePreview(manifest: ReleaseManifestV1): ReleasePreview {
  const mediaKinds: Record<string, number> = {};
  for (const asset of manifest.assets) mediaKinds[asset.kind] = (mediaKinds[asset.kind] ?? 0) + 1;
  return {
    story: structuredClone(manifest.story),
    release: structuredClone(manifest.release),
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    schemaVersion: manifest.schemaVersion,
    counts: { ...manifest.counts },
    mediaKinds,
    totalBytes: manifest.payload.size + manifest.counts.totalAssetBytes,
  };
}
