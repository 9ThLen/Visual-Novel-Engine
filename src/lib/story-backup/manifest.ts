import {
  STORY_BACKUP_CONTAINER_VERSION,
  STORY_BACKUP_FORMAT,
  STORY_BACKUP_LIMITS,
  STORY_BACKUP_PATHS,
  STORY_BACKUP_SCHEMA_VERSION,
  type StoryArchiveManifestV1,
  type StoryArchivePayloadV1,
  type StoryArchivePreview,
  type StoryBackupAsset,
} from '@/lib/story-backup/types';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const OBJECT_PATH_PATTERN = /^objects\/([a-f0-9]{64})$/;

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid story backup ${label}`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid story backup ${label}`);
  return value;
}

function requireSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Invalid story backup ${label}`);
  }
  return value as number;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)
    || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`Invalid story backup ${label}`);
  }
  return Array.from(new Set(value));
}

function parseAsset(value: unknown): StoryBackupAsset {
  const asset = requireObject(value, 'asset');
  const sha256 = requireString(asset.sha256, 'asset hash').toLowerCase();
  const archivePath = requireString(asset.archivePath, 'asset path');
  const match = OBJECT_PATH_PATTERN.exec(archivePath);
  if (!SHA256_PATTERN.test(sha256) || match?.[1] !== sha256) {
    throw new Error('Invalid story backup asset path or hash');
  }

  const parsed: StoryBackupAsset = {
    assetId: requireString(asset.assetId, 'asset ID'),
    sourceReferences: requireStringArray(asset.sourceReferences, 'asset references'),
    sha256,
    size: requireSafeInteger(asset.size, 'asset size'),
    kind: requireString(asset.kind, 'asset kind'),
    mimeType: requireString(asset.mimeType, 'asset MIME'),
    originalName: requireString(asset.originalName, 'asset name'),
    archivePath: archivePath as StoryBackupAsset['archivePath'],
  };
  if (asset.originalExtension !== undefined) {
    parsed.originalExtension = requireString(asset.originalExtension, 'asset extension');
  }
  return parsed;
}

export function parseStoryArchiveManifest(value: unknown): StoryArchiveManifestV1 {
  const manifest = requireObject(value, 'manifest');
  if (manifest.format !== STORY_BACKUP_FORMAT) throw new Error('Not a VNE story backup');
  if (manifest.containerVersion !== STORY_BACKUP_CONTAINER_VERSION) {
    throw new Error(`Unsupported story backup container version: ${String(manifest.containerVersion)}`);
  }
  if (manifest.schemaVersion !== STORY_BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported story backup schema version: ${String(manifest.schemaVersion)}`);
  }

  const story = requireObject(manifest.story, 'story');
  requireString(story.id, 'story ID');
  requireString(story.title, 'story title');
  const counts = requireObject(manifest.counts, 'counts');
  const payload = requireObject(manifest.payload, 'payload');
  const payloadHash = requireString(payload.sha256, 'payload hash').toLowerCase();
  if (payload.archivePath !== STORY_BACKUP_PATHS.payload || !SHA256_PATTERN.test(payloadHash)) {
    throw new Error('Invalid story backup payload descriptor');
  }

  if (!Array.isArray(manifest.assets)) throw new Error('Invalid story backup assets');
  if (manifest.assets.length > STORY_BACKUP_LIMITS.maxEntries - 2) {
    throw new Error('Story backup has too many entries');
  }
  const assets = manifest.assets.map(parseAsset);
  const assetIds = new Set<string>();
  const referenceOwners = new Map<string, string>();
  const objectSizes = new Map<string, number>();
  for (const asset of assets) {
    if (assetIds.has(asset.assetId)) throw new Error(`Duplicate story backup asset ID: ${asset.assetId}`);
    assetIds.add(asset.assetId);
    const objectSize = objectSizes.get(asset.sha256);
    if (objectSize !== undefined && objectSize !== asset.size) {
      throw new Error(`Inconsistent story backup object size: ${asset.sha256}`);
    }
    objectSizes.set(asset.sha256, asset.size);
    for (const reference of new Set([asset.assetId, ...asset.sourceReferences])) {
      const owner = referenceOwners.get(reference);
      if (owner && owner !== asset.assetId) {
        throw new Error(`Ambiguous story backup media reference: ${reference}`);
      }
      referenceOwners.set(reference, asset.assetId);
    }
  }

  const parsed: StoryArchiveManifestV1 = {
    format: STORY_BACKUP_FORMAT,
    containerVersion: STORY_BACKUP_CONTAINER_VERSION,
    schemaVersion: STORY_BACKUP_SCHEMA_VERSION,
    createdAt: requireString(manifest.createdAt, 'creation date'),
    appVersion: requireString(manifest.appVersion, 'app version'),
    story: structuredClone(story) as unknown as StoryArchiveManifestV1['story'],
    counts: {
      scenes: requireSafeInteger(counts.scenes, 'scene count'),
      characters: requireSafeInteger(counts.characters, 'character count'),
      audioItems: requireSafeInteger(counts.audioItems, 'audio count'),
      embeddedAssets: requireSafeInteger(counts.embeddedAssets, 'asset count'),
      totalAssetBytes: requireSafeInteger(counts.totalAssetBytes, 'asset byte count'),
    },
    payload: {
      archivePath: STORY_BACKUP_PATHS.payload,
      sha256: payloadHash,
      size: requireSafeInteger(payload.size, 'payload size'),
    },
    assets,
  };

  if (parsed.payload.size > STORY_BACKUP_LIMITS.maxPayloadBytes) {
    throw new Error('Story backup payload is too large');
  }
  if (assets.some((asset) => asset.size > STORY_BACKUP_LIMITS.maxObjectBytes)) {
    throw new Error('Story backup object is too large');
  }
  if (parsed.counts.embeddedAssets !== assets.length) {
    throw new Error('Story backup asset count does not match manifest');
  }
  if (parsed.counts.totalAssetBytes !== assets.reduce((total, asset) => total + asset.size, 0)) {
    throw new Error('Story backup asset size does not match manifest');
  }
  return parsed;
}

export function parseStoryArchivePayload(value: unknown): StoryArchivePayloadV1 {
  const payload = requireObject(value, 'payload');
  const scenes = requireObject(payload.scenes, 'scenes');
  if (!Array.isArray(payload.characters)) throw new Error('Invalid story backup characters');
  if (!Array.isArray(payload.audioLibrary)) throw new Error('Invalid story backup audio library');
  if (!Array.isArray(payload.mediaMembershipIds)
    || payload.mediaMembershipIds.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('Invalid story backup media membership');
  }
  return structuredClone({
    scenes,
    characters: payload.characters,
    audioLibrary: payload.audioLibrary,
    mediaMembershipIds: payload.mediaMembershipIds,
  }) as unknown as StoryArchivePayloadV1;
}

export function buildStoryArchivePreview(manifest: StoryArchiveManifestV1): StoryArchivePreview {
  const mediaKinds: Record<string, number> = {};
  for (const asset of manifest.assets) mediaKinds[asset.kind] = (mediaKinds[asset.kind] ?? 0) + 1;
  return {
    story: structuredClone(manifest.story),
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    schemaVersion: manifest.schemaVersion,
    counts: { ...manifest.counts },
    mediaKinds,
  };
}
