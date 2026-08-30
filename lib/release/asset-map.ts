/**
 * Where a packaged release keeps its media, and how a player finds it.
 *
 * Inside the container the bytes are content-addressed (`objects/<sha256>`).
 * A published web bundle unpacks them into `media/<sha256>.<ext>`, and the map
 * built here says which of those files each reference in the story means.
 *
 * The reason it is a map rather than a rule: a story refers to the same picture
 * by several different strings. `lib/story-backup/capture.ts` records all of
 * them in `sourceReferences` — the media-library id, the library asset's own
 * uri, and whatever literal string the scene stored, which on web is an
 * `idb-media://` uri pointing at a database the player does not have. Only the
 * manifest knows they are the same bytes.
 *
 * Content addressing is kept in the file name on purpose: identical art shared
 * between two releases is one file with one name, so a host caches it once and a
 * republish does not invalidate it.
 */
import type { ReleaseAsset, ReleaseManifestV1 } from '@/lib/release/types';

/** Directory the exporter unpacks objects into, relative to `index.html`. */
export const RELEASE_MEDIA_DIR = 'media';

/** Reference as the story writes it → path relative to the bundle root. */
export type ReleaseAssetMap = Record<string, string>;

/**
 * Extensions worth deriving when the original one is missing. Static hosts pick
 * a content type from the extension, and `<video>`/`<audio>` refuse a source
 * served as `application/octet-stream` — an image would still sniff, but sound
 * would simply never play.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/webm': '.weba',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

function extensionFor(asset: Pick<ReleaseAsset, 'originalExtension' | 'mimeType'>): string {
  const declared = asset.originalExtension;
  if (declared && /^\.[a-z0-9]{1,12}$/i.test(declared)) return declared.toLowerCase();
  const base = (asset.mimeType || '').split(';')[0].trim().toLowerCase();
  return EXTENSION_BY_MIME[base] ?? '.bin';
}

/**
 * The file one object is unpacked to. Identical bytes give an identical name,
 * so a release that reuses art from the previous one reuses the file too.
 */
export function releaseObjectFileName(
  asset: Pick<ReleaseAsset, 'sha256' | 'originalExtension' | 'mimeType'>,
): string {
  return `${asset.sha256}${extensionFor(asset)}`;
}

export interface ReleaseAssetMapOptions {
  /** Defaults to {@link RELEASE_MEDIA_DIR}. No leading or trailing slash. */
  mediaDir?: string;
}

/**
 * Every string the story might ask for, pointing at the file that answers it.
 *
 * Deduplicated by content hash, so two assets carrying the same bytes share one
 * file — and the first one's extension wins, because the bytes are the same
 * either way and two names for one payload would defeat the caching this
 * scheme exists for.
 */
export function buildReleaseAssetMap(
  manifest: ReleaseManifestV1,
  options: ReleaseAssetMapOptions = {},
): ReleaseAssetMap {
  const mediaDir = (options.mediaDir ?? RELEASE_MEDIA_DIR).replace(/^\/+|\/+$/g, '');
  const fileBySha = new Map<string, string>();
  const map: ReleaseAssetMap = {};

  for (const asset of manifest.assets) {
    let fileName = fileBySha.get(asset.sha256);
    if (!fileName) {
      fileName = releaseObjectFileName(asset);
      fileBySha.set(asset.sha256, fileName);
    }
    const target = mediaDir ? `${mediaDir}/${fileName}` : fileName;

    // The asset id is a reference in its own right: a scene may store the
    // library id rather than a uri, and the resolver is handed whichever the
    // scene wrote.
    for (const reference of [asset.assetId, ...asset.sourceReferences]) {
      if (typeof reference === 'string' && reference) map[reference] = target;
    }
  }

  return map;
}

/** The distinct files a bundle has to contain, in manifest order. */
export function releaseAssetFiles(
  manifest: ReleaseManifestV1,
): { sha256: string; fileName: string; size: number }[] {
  const seen = new Set<string>();
  const files: { sha256: string; fileName: string; size: number }[] = [];
  for (const asset of manifest.assets) {
    if (seen.has(asset.sha256)) continue;
    seen.add(asset.sha256);
    files.push({ sha256: asset.sha256, fileName: releaseObjectFileName(asset), size: asset.size });
  }
  return files;
}
