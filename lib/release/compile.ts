/**
 * Freezing a story into a release.
 *
 * Reuses `lib/story-backup/capture.ts` wholesale for asset collection: finding
 * every image, sprite, track and interactive-object reference a story depends
 * on is subtle work that is already written and tested, and a second
 * implementation would drift from it. Compile takes what capture produces and
 * narrows it into the stricter release contract.
 *
 * **Packaging is pass-through.** Nothing is re-encoded — see
 * RELEASE-PLAN.md and VIDEO-PLAN.md. Compile reports what a release weighs; the
 * author decides what to do about it.
 *
 * The compiler validates its own output through `parseReleaseManifest` before
 * returning. A producer that can emit something its own parser rejects is a bug
 * that would otherwise surface only when someone tried to open the file.
 */
import { parseReleaseManifest } from '@/lib/release/manifest';
import { computeReleaseStats } from '@/lib/release/preflight';
import {
  RELEASE_CONTAINER_VERSION,
  RELEASE_FORMAT,
  RELEASE_PATHS,
  RELEASE_SCHEMA_VERSION,
  type ReleaseAsset,
  type ReleaseBlock,
  type ReleaseChannel,
  type ReleaseManifestV1,
  type ReleasePayloadV1,
  type ReleasePresentation,
} from '@/lib/release/types';
import { generateReleaseId } from '@/lib/release/version';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { SceneRecordStorageLike } from '@/lib/scene-record-storage';
import { pickBannerEffect } from '@/lib/showcase/story-showcase';
import { captureStoryBackup } from '@/lib/story-backup/capture';
import { sha256Chunks, sourceFromBytes } from '@/lib/story-backup/hash';
import type { PreparedStoryBackupAsset } from '@/lib/story-backup/types';

/**
 * The oldest engine that understands release schema v1. Bumped only when a
 * change makes an older reader mis-play a release rather than merely miss a
 * feature — refusing to open is worse than degrading, so the bar is high.
 */
export const MIN_ENGINE_VERSION_FOR_RELEASE_V1 = '1.0.0';

export interface CompileReleaseInput {
  storyId: string;
  version: string;
  channel: ReleaseChannel;
  /** The build doing the compiling, e.g. from `Constants.expoConfig.version`. */
  engineVersion: string;
  notes?: string;
  /** Injectable so tests and retries are deterministic. */
  releaseId?: string;
  releasedAt?: string;
  storage?: SceneRecordStorageLike;
}

export interface CompiledRelease {
  manifest: ReleaseManifestV1;
  payload: ReleasePayloadV1;
  /**
   * Byte sources for the media the manifest lists, in the same order. Held for
   * the packaging step (R4); storing a release locally does not need them,
   * because the bytes are already in the media library.
   */
  assets: PreparedStoryBackupAsset[];
  /** The exact bytes hashed into `manifest.payload`. */
  payloadBytes: Uint8Array;
}

function enabledSteps(timeline: TimelineStep[] | undefined): TimelineStep[] {
  return (timeline ?? []).filter((step) => step?.enabled !== false);
}

/**
 * Freeze one scene: drop the steps the author disabled.
 *
 * A disabled step is authoring state — the writer's "not this, not yet". It is
 * invisible in the reader either way, so carrying it would only leak drafts
 * into a file the author hands to strangers.
 */
function freezeScene(scene: SceneRecord): SceneRecord {
  return { ...scene, timeline: enabledSteps(scene.timeline) };
}

function freezeScenes(scenes: Record<string, SceneRecord>): Record<string, SceneRecord> {
  const frozen: Record<string, SceneRecord> = {};
  for (const [sceneId, scene] of Object.entries(scenes)) {
    frozen[sceneId] = freezeScene(scene);
  }
  return frozen;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function buildPresentation(
  metadata: { thumbnailUri?: string; theme?: unknown; readerLayoutPreset?: unknown; startSceneId: string },
  scenes: SceneRecord[],
): ReleasePresentation | undefined {
  const presentation: ReleasePresentation = {};
  if (metadata.thumbnailUri) presentation.coverAssetId = metadata.thumbnailUri;

  const bannerEffect = pickBannerEffect(scenes, metadata.startSceneId);
  if (bannerEffect) presentation.bannerEffect = bannerEffect;

  if (metadata.theme) presentation.theme = metadata.theme as ReleasePresentation['theme'];
  if (metadata.readerLayoutPreset) {
    presentation.readerLayoutPreset = metadata.readerLayoutPreset as ReleasePresentation['readerLayoutPreset'];
  }

  return Object.keys(presentation).length > 0 ? presentation : undefined;
}

/**
 * Build the publication block, failing loudly on the three facts a release
 * cannot honestly omit. Preflight blocks on all three before the author gets
 * here, so reaching this error means a caller skipped the gate.
 */
function buildPublication(metadata: {
  author?: string;
  languages?: string[];
  contentRating?: ReleaseBlock['publication']['contentRating'];
  contentWarnings?: string[];
  licence?: string;
  credits?: ReleaseBlock['publication']['credits'];
  aiAssisted?: boolean;
}): ReleaseBlock['publication'] {
  const missing: string[] = [];
  if (!metadata.author?.trim()) missing.push('author');
  if (!metadata.languages?.length) missing.push('languages');
  if (!metadata.contentRating) missing.push('content rating');
  if (missing.length) {
    throw new Error(`Cannot compile a release without ${missing.join(', ')}`);
  }

  const publication: ReleaseBlock['publication'] = {
    author: metadata.author as string,
    languages: metadata.languages as string[],
    contentRating: metadata.contentRating as ReleaseBlock['publication']['contentRating'],
  };
  if (metadata.contentWarnings?.length) publication.contentWarnings = metadata.contentWarnings;
  if (metadata.licence) publication.licence = metadata.licence;
  if (metadata.credits?.length) publication.credits = metadata.credits;
  if (metadata.aiAssisted !== undefined) publication.aiAssisted = metadata.aiAssisted;
  return publication;
}

function toReleaseAsset(asset: PreparedStoryBackupAsset): ReleaseAsset {
  return { ...asset.metadata };
}

export async function compileRelease(input: CompileReleaseInput): Promise<CompiledRelease> {
  const captured = await captureStoryBackup(input.storyId, input.storage);

  const scenes = freezeScenes(captured.payload.scenes);
  const sceneList = Object.values(scenes);
  const payload: ReleasePayloadV1 = {
    scenes,
    characters: captured.payload.characters,
    audioLibrary: captured.payload.audioLibrary,
  };

  const payloadBytes = encodeJson(payload);
  const payloadDigest = await sha256Chunks(sourceFromBytes(payloadBytes).open());

  const assets = captured.assets.map(toReleaseAsset);
  const stats = computeReleaseStats(sceneList);
  const story = captured.story;

  const release: ReleaseBlock = {
    releaseId: input.releaseId ?? generateReleaseId(),
    storyId: story.id,
    version: input.version,
    channel: input.channel,
    releasedAt: input.releasedAt ?? new Date().toISOString(),
    engineVersion: input.engineVersion,
    minEngineVersion: MIN_ENGINE_VERSION_FOR_RELEASE_V1,
    payloadHash: payloadDigest.sha256,
    publication: buildPublication(story),
    stats,
  };
  if (input.notes?.trim()) release.notes = input.notes.trim();
  const presentation = buildPresentation(story, sceneList);
  if (presentation) release.presentation = presentation;

  const manifest: ReleaseManifestV1 = {
    format: RELEASE_FORMAT,
    containerVersion: RELEASE_CONTAINER_VERSION,
    schemaVersion: RELEASE_SCHEMA_VERSION,
    createdAt: release.releasedAt,
    appVersion: input.engineVersion,
    story: { ...story, sceneCount: sceneList.length },
    release,
    counts: {
      scenes: sceneList.length,
      characters: payload.characters.length,
      audioItems: payload.audioLibrary.length,
      embeddedAssets: assets.length,
      totalAssetBytes: assets.reduce((total, asset) => total + asset.size, 0),
    },
    payload: {
      archivePath: RELEASE_PATHS.payload,
      sha256: payloadDigest.sha256,
      size: payloadDigest.size,
    },
    assets,
  };

  return {
    // Round-trip through the parser: whatever compile returns must be something
    // a reader could have loaded from disk, with no in-memory-only shortcuts.
    manifest: parseReleaseManifest(JSON.parse(JSON.stringify(manifest))),
    payload,
    assets: captured.assets,
    payloadBytes,
  };
}
