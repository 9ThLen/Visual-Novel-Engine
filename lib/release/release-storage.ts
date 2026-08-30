/**
 * Local storage for frozen releases.
 *
 * Layout mirrors `lib/story-snapshots.ts`, for the same reason: one index key
 * per story so listing never reads a body, one manifest per release, one key
 * per scene. A release of a long story is megabytes; putting it in a single
 * blob would make every listing pay for it.
 *
 * **Media is pinned by being written here.** `lib/web-media-cleanup.ts` decides
 * what media is still live by scanning persisted values for media references
 * (`collectReferencedMediaKeys`), and a release manifest carries the
 * `idb-media://` URIs of everything it embeds. So a release written through
 * `createPersistentStorage` keeps its own art alive; a release written anywhere
 * else would have its images collected after the seven-day grace window and
 * become unplayable. This is a hard requirement of the format, not an
 * implementation detail — see `release-storage.test.ts`.
 *
 * All functions take their storage, so the module is testable without a browser
 * and callers can supply the same instance the rest of the app uses.
 */
import { parseReleaseManifest } from '@/lib/release/manifest';
import type { ReleaseChannel, ReleaseManifestV1, ReleasePayloadV1 } from '@/lib/release/types';
import { compareReleaseVersions, isReleaseVersion } from '@/lib/release/version';
import type { SceneRecord } from '@/lib/engine/types';
import type { StorageLike } from '@/lib/persistent-storage';
import { forgetReleaseObjects } from '@/lib/release/object-store';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export const RELEASE_STORAGE_VERSION = 1;

/**
 * How many releases one story keeps. Beyond this the oldest **unpublished**
 * release is evicted; a published one is never discarded to make room, because
 * something out there may be playing it.
 */
export const MAX_RELEASES_PER_STORY = 20;

/** Listing-sized record. Never carries scenes. */
export interface ReleaseMeta {
  releaseId: string;
  storyId: string;
  version: string;
  channel: ReleaseChannel;
  releasedAt: string;
  notes?: string;
  /** Whether the showcase shows it. Unpublishing keeps the artifact. */
  published: boolean;
  sceneCount: number;
  totalBytes: number;
}

interface ReleaseIndex {
  version: number;
  storyId: string;
  releases: ReleaseMeta[];
}

interface StoredReleaseManifest {
  version: number;
  storyId: string;
  releaseId: string;
  manifest: unknown;
}

interface StoredReleaseLibraries {
  version: number;
  storyId: string;
  releaseId: string;
  characters: unknown[];
  audioLibrary: unknown[];
  sceneIds: string[];
}

interface StoredReleaseScene {
  version: number;
  storyId: string;
  releaseId: string;
  record: SceneRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(storage: StorageLike, key: string): Promise<unknown> {
  try {
    const raw = await storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // A corrupt entry is indistinguishable from a missing one to every caller
    // here, and throwing would make one bad release break the whole listing.
    return null;
  }
}

function parseReleaseMeta(value: unknown, storyId: string): ReleaseMeta | null {
  if (!isRecord(value)) return null;
  const { releaseId, version, channel, releasedAt, published, sceneCount, totalBytes, notes } = value;
  if (typeof releaseId !== 'string' || !releaseId) return null;
  if (typeof version !== 'string' || !isReleaseVersion(version)) return null;
  if (channel !== 'page' && channel !== 'app' && channel !== 'both') return null;
  if (typeof releasedAt !== 'string' || !releasedAt) return null;

  const meta: ReleaseMeta = {
    releaseId,
    storyId,
    version,
    channel,
    releasedAt,
    published: published === true,
    sceneCount: Number.isSafeInteger(sceneCount) ? (sceneCount as number) : 0,
    totalBytes: Number.isSafeInteger(totalBytes) ? (totalBytes as number) : 0,
  };
  if (typeof notes === 'string' && notes) meta.notes = notes;
  return meta;
}

function parseReleaseIndex(raw: unknown, storyId: string): ReleaseIndex {
  const empty: ReleaseIndex = { version: RELEASE_STORAGE_VERSION, storyId, releases: [] };
  if (!isRecord(raw) || !Array.isArray(raw.releases)) return empty;

  const seen = new Set<string>();
  const releases: ReleaseMeta[] = [];
  for (const entry of raw.releases) {
    const meta = parseReleaseMeta(entry, storyId);
    if (!meta || seen.has(meta.releaseId)) continue;
    seen.add(meta.releaseId);
    releases.push(meta);
  }
  return { version: RELEASE_STORAGE_VERSION, storyId, releases };
}

/** Newest first, by version — the order every caller wants to display. */
function sortReleases(releases: ReleaseMeta[]): ReleaseMeta[] {
  return [...releases].sort((a, b) => compareReleaseVersions(b.version, a.version));
}

async function writeIndex(
  storage: StorageLike,
  storyId: string,
  releases: ReleaseMeta[],
): Promise<void> {
  const index: ReleaseIndex = {
    version: RELEASE_STORAGE_VERSION,
    storyId,
    releases: sortReleases(releases),
  };
  await storage.setItem(STORAGE_KEYS.RELEASE_INDEX(storyId), JSON.stringify(index));
}

export async function listReleases(
  storage: StorageLike,
  storyId: string,
): Promise<ReleaseMeta[]> {
  const index = parseReleaseIndex(await readJson(storage, STORAGE_KEYS.RELEASE_INDEX(storyId)), storyId);
  return sortReleases(index.releases);
}

export async function readReleaseManifest(
  storage: StorageLike,
  storyId: string,
  releaseId: string,
): Promise<ReleaseManifestV1 | null> {
  const stored = await readJson(storage, STORAGE_KEYS.RELEASE_MANIFEST(storyId, releaseId));
  if (!isRecord(stored)) return null;
  try {
    return parseReleaseManifest(stored.manifest);
  } catch {
    return null;
  }
}

export async function readReleasePayload(
  storage: StorageLike,
  storyId: string,
  releaseId: string,
): Promise<ReleasePayloadV1 | null> {
  const stored = await readJson(storage, STORAGE_KEYS.RELEASE_LIBRARIES(storyId, releaseId));
  if (!isRecord(stored) || !Array.isArray(stored.sceneIds)) return null;

  const scenes: Record<string, SceneRecord> = {};
  for (const sceneId of stored.sceneIds) {
    if (typeof sceneId !== 'string') continue;
    const scene = await readJson(storage, STORAGE_KEYS.RELEASE_SCENE(storyId, releaseId, sceneId));
    if (!isRecord(scene) || !isRecord(scene.record)) continue;
    scenes[sceneId] = scene.record as unknown as SceneRecord;
  }
  // A release missing scene bodies is not a release; better to report nothing
  // than to hand a reader a story with holes in it.
  if (Object.keys(scenes).length !== stored.sceneIds.length) return null;

  return {
    scenes,
    characters: (Array.isArray(stored.characters) ? stored.characters : []) as ReleasePayloadV1['characters'],
    audioLibrary: (Array.isArray(stored.audioLibrary) ? stored.audioLibrary : []) as ReleasePayloadV1['audioLibrary'],
  };
}

/** Delete every key belonging to one release. Safe to call for a missing one. */
export async function deleteRelease(
  storage: StorageLike,
  storyId: string,
  releaseId: string,
): Promise<ReleaseMeta[]> {
  const stored = await readJson(storage, STORAGE_KEYS.RELEASE_LIBRARIES(storyId, releaseId));
  const sceneIds = isRecord(stored) && Array.isArray(stored.sceneIds) ? stored.sceneIds : [];
  for (const sceneId of sceneIds) {
    if (typeof sceneId !== 'string') continue;
    await storage.removeItem(STORAGE_KEYS.RELEASE_SCENE(storyId, releaseId, sceneId));
  }
  await storage.removeItem(STORAGE_KEYS.RELEASE_LIBRARIES(storyId, releaseId));
  await storage.removeItem(STORAGE_KEYS.RELEASE_MANIFEST(storyId, releaseId));
  // Drops this release's claim on its media; objects another release still
  // needs stay. Two versions of a novel usually differ by a page of text, and
  // deleting the older one must not take the newer one's artwork with it.
  await forgetReleaseObjects(releaseId, storage);

  const remaining = (await listReleases(storage, storyId))
    .filter((release) => release.releaseId !== releaseId);
  await writeIndex(storage, storyId, remaining);
  return remaining;
}

/**
 * The release evicted to make room: the oldest **unpublished** one. Returns
 * null when every release is published, in which case the cap is exceeded
 * rather than a published artifact being destroyed.
 */
function selectEvictionVictim(releases: ReleaseMeta[]): ReleaseMeta | null {
  const unpublished = releases.filter((release) => !release.published);
  if (!unpublished.length) return null;
  return sortReleases(unpublished)[unpublished.length - 1];
}

export interface SaveReleaseInput {
  manifest: ReleaseManifestV1;
  payload: ReleasePayloadV1;
  /** Whether it goes live on the showcase immediately. Defaults to true. */
  published?: boolean;
  onEvict?: (releaseId: string) => void;
}

export async function saveRelease(
  storage: StorageLike,
  input: SaveReleaseInput,
): Promise<ReleaseMeta> {
  const { manifest, payload } = input;
  const storyId = manifest.release.storyId;
  const releaseId = manifest.release.releaseId;
  const sceneIds = Object.keys(payload.scenes);

  // Bodies first, index last: a crash mid-write leaves orphaned bodies that
  // nothing lists, which is recoverable. The reverse order would leave the
  // index advertising a release whose scenes are not there.
  for (const sceneId of sceneIds) {
    const scene: StoredReleaseScene = {
      version: RELEASE_STORAGE_VERSION,
      storyId,
      releaseId,
      record: payload.scenes[sceneId],
    };
    await storage.setItem(STORAGE_KEYS.RELEASE_SCENE(storyId, releaseId, sceneId), JSON.stringify(scene));
  }

  const libraries: StoredReleaseLibraries = {
    version: RELEASE_STORAGE_VERSION,
    storyId,
    releaseId,
    characters: payload.characters,
    audioLibrary: payload.audioLibrary,
    sceneIds,
  };
  await storage.setItem(STORAGE_KEYS.RELEASE_LIBRARIES(storyId, releaseId), JSON.stringify(libraries));

  const storedManifest: StoredReleaseManifest = {
    version: RELEASE_STORAGE_VERSION,
    storyId,
    releaseId,
    manifest,
  };
  await storage.setItem(STORAGE_KEYS.RELEASE_MANIFEST(storyId, releaseId), JSON.stringify(storedManifest));

  const meta: ReleaseMeta = {
    releaseId,
    storyId,
    version: manifest.release.version,
    channel: manifest.release.channel,
    releasedAt: manifest.release.releasedAt,
    published: input.published !== false,
    sceneCount: sceneIds.length,
    totalBytes: manifest.payload.size + manifest.counts.totalAssetBytes,
  };
  if (manifest.release.notes) meta.notes = manifest.release.notes;

  const existing = (await listReleases(storage, storyId))
    .filter((release) => release.releaseId !== releaseId);
  let next = [...existing, meta];

  while (next.length > MAX_RELEASES_PER_STORY) {
    const victim = selectEvictionVictim(next.filter((release) => release.releaseId !== releaseId));
    if (!victim) break;
    next = next.filter((release) => release.releaseId !== victim.releaseId);
    await deleteRelease(storage, storyId, victim.releaseId);
    input.onEvict?.(victim.releaseId);
    // deleteRelease rewrote the index from what it read; rewrite below wins.
  }

  await writeIndex(storage, storyId, next);
  return meta;
}

export async function setReleasePublished(
  storage: StorageLike,
  storyId: string,
  releaseId: string,
  published: boolean,
): Promise<ReleaseMeta[]> {
  const releases = await listReleases(storage, storyId);
  if (!releases.some((release) => release.releaseId === releaseId)) return releases;

  const next = releases.map((release) => (
    release.releaseId === releaseId ? { ...release, published } : release
  ));
  await writeIndex(storage, storyId, next);
  return sortReleases(next);
}

/** The release the showcase should render: the highest published version. */
export function currentPublishedRelease(releases: ReleaseMeta[]): ReleaseMeta | null {
  return sortReleases(releases).find((release) => release.published) ?? null;
}

/**
 * The version a new release must exceed. Counts unpublished releases too: a
 * version number that has ever been minted must not be reused, or two
 * different artifacts would claim to be the same release.
 */
export function highestReleaseVersion(releases: ReleaseMeta[]): string | null {
  return sortReleases(releases)[0]?.version ?? null;
}
