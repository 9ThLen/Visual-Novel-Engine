/**
 * Getting a stored release's media bytes back.
 *
 * A saved release keeps its manifest and its payload; the bytes stay in the
 * media library, because copying them would double every author's disk for no
 * gain (see `lib/release/release-storage.ts`). Packaging a release therefore has
 * to find them again — and prove they are still the same bytes.
 *
 * That proof is the point of this module. The manifest records a SHA-256 and a
 * size per object; if an author replaced a picture after publishing, resolving
 * the reference now yields different bytes, and a bundle built from them would
 * be a release that does not match its own manifest. Better to refuse and name
 * the file.
 */
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
  const objects = new Map<string, ResolvedReleaseObject>();
  let done = 0;
  for (const [sha256, asset] of wanted) {
    const bytes = await resolveOneAsset(asset, resolveSource);
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
