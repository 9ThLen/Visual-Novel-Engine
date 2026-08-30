/**
 * Exporting a playable folder from inside the app.
 *
 * The studio cannot compile a player, so it downloads one that was compiled
 * alongside it (`lib/release/shell.ts`), unzips it, drops the release's media in,
 * writes the boot config into every HTML entry point, and zips the result. What
 * comes out is the same bundle `scripts/export-story-web.ts` produces — the
 * parts that decide what a bundle *is* are shared in
 * `lib/release/player-bundle.ts` precisely so the two cannot drift.
 *
 * **Held in memory, whole, and zipped on the main thread.** A browser tab has no
 * filesystem to stream through, so the shell, the media and the finished zip all
 * exist at once. The zipping is synchronous on purpose: fflate's async API
 * builds a worker from a `blob:` URL, and the production CSP written by
 * `scripts/lib/harden-web-output.mjs` refuses blob workers — fflate then hangs
 * rather than failing, so the export sat forever on "assembling". Widening the
 * policy for one operation is the wrong trade; a tab that pauses during an
 * export the author asked for is understandable, and a tab that never finishes
 * is not.
 *
 * The cost is real for a very large novel. The size a release weighs is shown to
 * the author before they get here, and `RELEASE_LIMITS.softWarnBytes` is where
 * the warning starts.
 */
import { unzipSync, zipSync, type Zippable } from 'fflate';

import { releaseObjectFileName, RELEASE_MEDIA_DIR } from '@/lib/release/asset-map';
import {
  collectReleaseObjects,
  type ReleaseSourceResolver,
} from '@/lib/release/asset-sources';
import {
  buildPlayerBootConfig,
  findUnpackagedBundledReferences,
  inlinePlayerConfig,
  PLAYER_BUNDLE_HTML_FILES,
} from '@/lib/release/player-bundle';
import {
  readReleaseManifest,
  readReleasePayload,
} from '@/lib/release/release-storage';
import {
  checkPlayerShell,
  fetchPlayerShell,
  loadPlayerShellDescriptor,
  type PlayerShellDescriptor,
  type PlayerShellProblem,
} from '@/lib/release/shell';
import type { ReleaseManifestV1, ReleasePayloadV1 } from '@/lib/release/types';
import { createPersistentStorage, type StorageLike } from '@/lib/persistent-storage';

/**
 * Mirrors `StoryBackupProgress` in shape and intent, with the two steps a
 * backup does not have: fetching the shell and assembling the zip.
 */
export type PlayerBundleProgress =
  | 'preparing'
  | 'downloading'
  | 'collecting'
  | 'assembling'
  | 'saving';

export interface BuildPlayerBundleInput {
  storyId: string;
  releaseId: string;
  engineVersion: string;
  onProgress?: (progress: PlayerBundleProgress) => void;
  storage?: StorageLike;
  /** Injectable so tests need no network and no shell on disk. */
  loadShell?: () => Promise<{ descriptor: PlayerShellDescriptor; bytes: Uint8Array } | null>;
  /** Injectable so tests need no media library. See `asset-sources.ts`. */
  resolveSource?: ReleaseSourceResolver;
}

export interface BuiltPlayerBundle {
  fileName: string;
  bytes: Uint8Array;
  manifest: ReleaseManifestV1;
  /** Distinct media files written into the bundle. */
  mediaFiles: number;
}

/** An export that cannot proceed, with enough detail to tell the author why. */
export class PlayerShellUnavailableError extends Error {
  constructor(readonly problem: PlayerShellProblem) {
    super(
      problem.kind === 'version-mismatch'
        ? `This app is version ${problem.engineVersion} but the player it would build from was made for ${problem.shellVersion}.`
        : 'This app was not deployed with a player to build from.',
    );
    this.name = 'PlayerShellUnavailableError';
  }
}

/**
 * Let the browser paint the progress label before a synchronous step blocks it.
 * Without this the screen freezes on whatever it last showed, which reads as a
 * hang rather than as work.
 */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type CompressionLevel = 0 | 6;

/**
 * Compress the text and leave the media alone.
 *
 * Everything in `media/` is already a compressed format, and deflating a JPEG
 * again buys a percent or two for a lot of time in a browser tab. The HTML and
 * the JS are worth it: they are the part that is plain text.
 */
function compressionFor(fileName: string): CompressionLevel {
  return fileName.startsWith(`${RELEASE_MEDIA_DIR}/`) ? 0 : 6;
}

function safeBundleFileName(title: string, version: string): string {
  const base = title.trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return `${base || 'story'}-v${version}.zip`;
}


async function defaultLoadShell(): Promise<{ descriptor: PlayerShellDescriptor; bytes: Uint8Array } | null> {
  const descriptor = await loadPlayerShellDescriptor();
  if (!descriptor) return null;
  return { descriptor, bytes: await fetchPlayerShell(descriptor) };
}

export async function buildPlayerBundle(
  input: BuildPlayerBundleInput,
): Promise<BuiltPlayerBundle> {
  const { onProgress } = input;
  const storage = input.storage ?? createPersistentStorage();

  onProgress?.('preparing');
  const manifest = await readReleaseManifest(storage, input.storyId, input.releaseId);
  if (!manifest) throw new Error('That release is no longer stored on this device.');
  const payload = await readReleasePayload(storage, input.storyId, input.releaseId);
  if (!payload) throw new Error('That release is no longer stored on this device.');

  onProgress?.('downloading');
  const shell = await (input.loadShell ?? defaultLoadShell)();
  // The version is checked after the descriptor is in hand but before anything
  // is built, so an author on a mismatched deployment is told immediately rather
  // than after collecting every asset.
  const problem = checkPlayerShell(shell?.descriptor ?? null, input.engineVersion);
  if (problem || !shell) throw new PlayerShellUnavailableError(problem ?? { kind: 'missing' });

  onProgress?.('collecting');
  const objects = await collectReleaseObjects(manifest, { resolveSource: input.resolveSource });

  onProgress?.('assembling');
  await yieldToPaint();

  const files: Zippable = {};
  const unzipped = unzipSync(shell.bytes);
  for (const [name, bytes] of Object.entries(unzipped)) {
    // Directory entries carry no bytes and would become empty files.
    if (name.endsWith('/')) continue;
    files[name] = [bytes, { level: compressionFor(name) }];
  }

  // Refused rather than shipped: a bundle missing a picture looks fine on the
  // author's machine, where the file still exists, and broken everywhere else.
  const unpackaged = findUnpackagedBundledReferences(payload, manifest);
  if (unpackaged.length > 0) {
    throw new Error(
      `This release refers to ${unpackaged.length} file(s) it did not package, so they `
      + `would be missing from the folder:\n${unpackaged.join('\n')}`,
    );
  }

  const config = buildPlayerBootConfig({ manifest, payload });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let inlined = 0;
  for (const name of PLAYER_BUNDLE_HTML_FILES) {
    const existing = unzipped[name];
    if (!existing) continue;
    const html = inlinePlayerConfig(decoder.decode(existing), config);
    files[name] = [encoder.encode(html), { level: compressionFor(name) }];
    inlined += 1;
  }
  if (inlined === 0) {
    throw new Error('The player shell contains no index.html to write the story into.');
  }

  for (const asset of manifest.assets) {
    const object = objects.get(asset.sha256);
    if (!object) continue;
    const target = `${RELEASE_MEDIA_DIR}/${releaseObjectFileName(asset)}`;
    files[target] = [object.bytes, { level: 0 }];
  }

  const bytes = zipSync(files, { level: 6 });

  onProgress?.('saving');
  return {
    fileName: safeBundleFileName(manifest.story.title, manifest.release.version),
    bytes,
    manifest,
    mediaFiles: objects.size,
  };
}
