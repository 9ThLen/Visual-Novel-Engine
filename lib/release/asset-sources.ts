/**
 * Getting a stored release's media bytes back.
 *
 * Publishing writes the bytes into the shared object store
 * (`lib/release/object-store.ts`), so normally this is a lookup by content hash
 * and nothing more. The fallback below exists for releases published before that
 * store did — those kept only a manifest, and their bytes have to be found in
 * the media library again, where an author may since have replaced them.
 *
 * Either way the hash is checked. A bundle built from bytes that no longer match
 * the manifest would be a release contradicting its own record of itself, and
 * the only sign of it would be a reader's broken copy.
 */
import { readReleaseObject } from '@/lib/release/object-store';
import type { StorageLike } from '@/lib/persistent-storage';
import { sha256Chunks, sourceFromBytes } from '@/lib/story-backup/hash';
import {
  resolveStoryBackupSource,
  type ResolvedStoryBackupSource,
} from '@/lib/story-backup/media-source';
import type { ReleaseAsset, ReleaseManifestV1 } from '@/lib/release/types';

/**
 * How a reference becomes bytes. Injectable so the verification below can be
 * tested against a device that behaves however the case needs — a missing file,
 * a changed one — without a real media library.
 */
export type ReleaseSourceResolver = (reference: string) => Promise<ResolvedStoryBackupSource>;

export interface ResolvedReleaseObject {
  sha256: string;
  bytes: Uint8Array;
}

async function readAll(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of source) {
    chunks.push(chunk.slice());
    size += chunk.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Try every name the manifest recorded for one object.
 *
 * `sourceReferences` holds the media-library id, the library asset's own uri and
 * whatever string the scene stored. Any one of them may have stopped resolving —
 * the library entry renamed, the uri rewritten by a migration — while another
 * still works, so a single failure is not the answer.
 */
async function resolveOneAsset(
  asset: ReleaseAsset,
  resolveSource: ReleaseSourceResolver,
): Promise<Uint8Array> {
  const references = [...new Set([asset.assetId, ...asset.sourceReferences])].filter(Boolean);
  const failures: string[] = [];

  for (const reference of references) {
    try {
      const resolved = await resolveSource(reference);
      return await readAll(resolved.source.open());
    } catch (error) {
      failures.push(`${reference}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `"${asset.originalName}" is no longer in the media library.\n${failures.join('\n')}`,
  );
}

export interface CollectReleaseObjectsOptions {
  onObject?: (done: number, total: number) => void;
  resolveSource?: ReleaseSourceResolver;
  storage?: StorageLike;
  /** Injectable so a test can exercise the fallback without an object store. */
  readObject?: (sha256: string) => Promise<{ open(): AsyncIterable<Uint8Array> } | null>;
}

/**
 * Every distinct object the manifest lists, keyed by content hash and verified
 * against it.
 *
 * Deduplicated by hash: the same picture referenced from four scenes is one
 * read, not four.
 */
export async function collectReleaseObjects(
  manifest: ReleaseManifestV1,
  options: CollectReleaseObjectsOptions = {},
): Promise<Map<string, ResolvedReleaseObject>> {
  const wanted = new Map<string, ReleaseAsset>();
  for (const asset of manifest.assets) {
    if (!wanted.has(asset.sha256)) wanted.set(asset.sha256, asset);
  }

  const resolveSource = options.resolveSource ?? resolveStoryBackupSource;
  const readObject = options.readObject
    ?? ((sha256: string) => readReleaseObject(sha256, options.storage));
  const objects = new Map<string, ResolvedReleaseObject>();
  let done = 0;
  for (const [sha256, asset] of wanted) {
    // The release's own copy first. The library is only asked when a release
    // predates the object store — and that is when the bytes may have moved on.
    const stored = await readObject(sha256);
    const bytes = stored
      ? await readAll(stored.open())
      : await resolveOneAsset(asset, resolveSource);
    const digest = await sha256Chunks(sourceFromBytes(bytes).open());
    if (digest.sha256 !== sha256 || digest.size !== asset.size) {
      throw new Error(
        `"${asset.originalName}" has changed since this release was published. ` +
        'Publish a new version rather than exporting this one.',
      );
    }
    objects.set(sha256, { sha256, bytes });
    done += 1;
    options.onObject?.(done, wanted.size);
  }

  return objects;
}
