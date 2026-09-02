/**
 * Asset Resolver
 * Handles resolution of bundled and external asset URIs
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '@/lib/error-handler';
import {
  getMediaBlob,
  getMediaBlobStorageKey,
  IDB_MEDIA_URI_PREFIX,
} from '@/lib/idb-storage';
import { getBrowserSafeAudioUri } from './audio-web-source';
import { BUNDLED_ASSETS } from '@/lib/bundled-assets';
import { resolveWebUrl } from '@/lib/web-base-url';
import { resolveLibraryAssetUri } from '@/stores/media-library-actions';
import { isSafeUri } from './story-validator';

type TimedCacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

/**
 * Where a published release keeps its media, when the app is running as one.
 *
 * A packaged bundle carries its art as plain files next to `index.html`, and the
 * story still refers to it by whatever string the author's device used — most
 * often an `idb-media://` uri naming a database that exists only on that
 * device. Without this the reader would resolve those to nothing and play a
 * story with no pictures, which is precisely the case R5 exists to fix.
 *
 * Deliberately a plain string map set from the outside rather than an import of
 * the release code: the resolver sits in the reader's core, and a player build
 * should not gain the release machinery just to look up a filename.
 */
let packagedMediaByReference: Record<string, string> | null = null;

/** Called once at player boot. `null` restores normal resolution. */
export function setPackagedMediaMap(map: Record<string, string> | null): void {
  packagedMediaByReference = map && Object.keys(map).length > 0 ? map : null;
  uriCache.clear();
  playableUriCache.clear();
}

export function getPackagedMediaMap(): Record<string, string> | null {
  return packagedMediaByReference;
}

/**
 * The packaged file for a reference, resolved synchronously.
 *
 * Some callers cannot await — a list item drawing an image as it scrolls — and
 * a bundle's media is a plain relative path, so there is nothing to await
 * anyway. Returns `null` when this build is not a published bundle, or when the
 * bundle does not carry that reference.
 */
export function getPackagedMediaUri(reference: string | undefined | null): string | null {
  if (!reference || !packagedMediaByReference) return null;
  const target = packagedMediaByReference[reference]
    ?? packagedMediaByReference[reference.replace('bundle://', '')];
  return target ? resolveWebUrl(target) : null;
}

const uriCache = new Map<string, TimedCacheEntry<string | number | null>>();
const playableUriCache = new Map<string, TimedCacheEntry<string | null>>();
const mediaObjectUrlCache = new Map<string, string>();
/**
 * Object-URL lifetime bookkeeping.
 *
 * `mediaObjectUrlCache` is keyed by storage key while `uriCache` is keyed by
 * whatever the caller passed in — an asset id, an asset uri, an `idb-media://`
 * uri — and one blob is commonly reached through all three. Revoking a URL
 * therefore has to invalidate several unrelated-looking cache keys, which is
 * what the alias index is for: without it a retry after a revoke hands back the
 * dead URL until the entry's TTL expires.
 *
 * The lease counts exist because the media library is the first screen that
 * resolves more media than the cache holds: evicting the oldest entry would
 * revoke a URL an open player is still using.
 */
const mediaAliasKeys = new Map<string, Set<string>>();
/**
 * In-flight blob reads, keyed by storage key. One blob is reachable through
 * several resolver inputs, each with its own `uriCache` entry, so concurrent
 * resolves would otherwise both miss the object-URL cache and both create a
 * URL — leaving the loser untracked and unrevokable.
 */
const mediaObjectUrlPromises = new Map<string, Promise<string | null>>();
const storageKeyByAlias = new Map<string, string>();
const mediaLeaseCounts = new Map<string, number>();
let pinnedEvictionWarned = false;
const MODULE_CACHE_MAX_SIZE = 50;

function evictOldest(cache: Map<unknown, unknown>, maxSize: number): void {
  if (cache.size >= maxSize) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
}

const moduleUriCache = new Map<number, string>();
const modulePlayableCache = new Map<number, string>();
const URI_CACHE_MAX_SIZE = 100;
const URI_CACHE_TTL_MS = 5 * 60 * 1000;
const SAFE_DATA_URI_PREFIXES = [
  'data:image/',
  'data:audio/',
  'data:video/',
  'data:font/',
  'data:application/octet-stream',
];

// ── Path traversal prevention ────────────────────────────────────────────────

/** Characters that are not allowed in file names */
const DANGEROUS_FILENAME_CHARS = /[<>:"|?*\x00-\x1f]/;

/** Check if a path contains directory traversal attempts */
function isPathSafe(path: string): boolean {
  if (path.includes('..')) return false;
  if (path.includes('\0')) return false;
  const filename = path.split('/').pop() || '';
  if (DANGEROUS_FILENAME_CHARS.test(filename)) return false;
  return true;
}

function getTimedCacheEntry<T>(cache: Map<string, TimedCacheEntry<T>>, key: string): Promise<T> | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setTimedCacheEntry<T>(cache: Map<string, TimedCacheEntry<T>>, key: string, value: Promise<T>): void {
  if (cache.size >= URI_CACHE_MAX_SIZE) {
    // Evict oldest entry (first inserted)
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, {
    expiresAt: Date.now() + URI_CACHE_TTL_MS,
    value,
  });
}

function isSafeDataUri(uri: string): boolean {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.startsWith('data:image/svg+xml')) return false;
  return SAFE_DATA_URI_PREFIXES.some((prefix) => lowerUri.startsWith(prefix));
}

function rememberMediaAliases(storageKey: string, aliasKeys: readonly string[]): void {
  const keys = mediaAliasKeys.get(storageKey) ?? new Set<string>();
  for (const aliasKey of aliasKeys) {
    keys.add(aliasKey);
    storageKeyByAlias.set(aliasKey, storageKey);
  }
  mediaAliasKeys.set(storageKey, keys);
}

function revokeMediaObjectUrl(storageKey: string): void {
  const objectUrl = mediaObjectUrlCache.get(storageKey);
  if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl);
  mediaObjectUrlCache.delete(storageKey);
  // Drop every cached promise that resolved to the URL just revoked. These
  // caches are keyed by resolver input, so only the alias index can find them.
  for (const aliasKey of mediaAliasKeys.get(storageKey) ?? []) {
    uriCache.delete(aliasKey);
    playableUriCache.delete(aliasKey);
    storageKeyByAlias.delete(aliasKey);
  }
  mediaAliasKeys.delete(storageKey);
}

/**
 * Bring the object-URL cache back to its limit, never at the cost of a leased
 * entry. Drains rather than dropping a single entry: once leases have pushed
 * the cache past the limit, evicting one per insertion would hold it at its
 * peak size forever.
 */
function evictUnleasedMediaObjectUrls(): void {
  let evicted = false;

  while (mediaObjectUrlCache.size >= URI_CACHE_MAX_SIZE) {
    let candidate: string | undefined;
    for (const storageKey of mediaObjectUrlCache.keys()) {
      if ((mediaLeaseCounts.get(storageKey) ?? 0) > 0) continue;
      candidate = storageKey;
      break;
    }
    if (candidate === undefined) break;
    revokeMediaObjectUrl(candidate);
    evicted = true;
  }

  if (evicted) {
    pinnedEvictionWarned = false;
    return;
  }
  if (mediaObjectUrlCache.size < URI_CACHE_MAX_SIZE) return;

  // Everything is leased. Growing past the limit is the lesser evil: revoking a
  // URL that a mounted player is using breaks it with no way to recover, while
  // an oversized cache only costs memory until the leases are released.
  if (__DEV__ && !pinnedEvictionWarned) {
    pinnedEvictionWarned = true;
    console.warn(
      `[AssetResolver] ${mediaObjectUrlCache.size} object URLs are all leased; the cache is over its ${URI_CACHE_MAX_SIZE} limit. A leaked lease is the usual cause.`,
    );
  }
}

async function resolveIndexedDbMediaUri(uri: string, aliasKeys: readonly string[]): Promise<string | null> {
  const storageKey = getMediaBlobStorageKey(uri);
  if (!storageKey) {
    ErrorHandler.handle('Blocked invalid IndexedDB media URI', null, ErrorCategory.VALIDATION, ErrorSeverity.LOW, { uri });
    return null;
  }

  rememberMediaAliases(storageKey, aliasKeys);

  const cached = mediaObjectUrlCache.get(storageKey);
  if (cached) return cached;

  // Share one read per storage key so concurrent aliases cannot each mint a URL.
  const inFlight = mediaObjectUrlPromises.get(storageKey);
  if (inFlight) return inFlight;

  const pending = (async () => {
    try {
      const blob = await getMediaBlob(storageKey);
      if (!blob) {
        ErrorHandler.handle('IndexedDB media Blob not found', null, ErrorCategory.MEDIA, ErrorSeverity.LOW, { uri });
        return null;
      }
      // Re-check: another caller may have finished while this read was awaited.
      const settled = mediaObjectUrlCache.get(storageKey);
      if (settled) return settled;

      const objectUrl = URL.createObjectURL(blob);
      evictUnleasedMediaObjectUrls();
      mediaObjectUrlCache.set(storageKey, objectUrl);
      return objectUrl;
    } catch (error) {
      ErrorHandler.handle('Could not read IndexedDB media Blob', error, ErrorCategory.MEDIA, ErrorSeverity.LOW, { uri });
      return null;
    } finally {
      mediaObjectUrlPromises.delete(storageKey);
    }
  })();

  mediaObjectUrlPromises.set(storageKey, pending);
  return pending;
}


/**
 * Get a bundled asset by ID
 */
export function getBundledAsset(assetId: string): number | null {
  if (!assetId) return null;

  // A published bundle carries its own copy of this file and does not ship the
  // app's `assets/` tree at all, so the compiled asset map would resolve to a
  // path that is not there. Callers fall back to `resolveAssetUri`, which reads
  // the packaged map — returning null here is what sends them down that road.
  // Found the hard way: character sprites went through this function and only
  // this function, so a published bundle rendered its backgrounds and none of
  // its people.
  if (getPackagedMediaUri(assetId)) return null;

  const cleaned = assetId.replace('bundle://', '');
  
  // Direct match
  if (BUNDLED_ASSETS[cleaned]) return BUNDLED_ASSETS[cleaned];
  if (BUNDLED_ASSETS[assetId]) return BUNDLED_ASSETS[assetId];

  // Filename match
  const filename = cleaned.split('/').pop() || '';
  const filenameNoExt = filename.replace(/\.[^/.]+$/, '');
  
  if (BUNDLED_ASSETS[filename]) return BUNDLED_ASSETS[filename];
  if (BUNDLED_ASSETS[filenameNoExt]) return BUNDLED_ASSETS[filenameNoExt];

  return null;
}

/**
 * Resolve an asset URI
 * Handles both local files and external URIs
 * Returns a string URI or a numeric asset ID that can be used with expo-image or audio players
 */
export async function resolveAssetUri(uri: string | undefined): Promise<string | number | null> {
  if (!uri) return null;

  const cached = getTimedCacheEntry(uriCache, uri);
  if (cached) return cached;

  const promise = resolveUri(uri);
  setTimedCacheEntry(uriCache, uri, promise);
  return promise;
}

/**
 * @param aliasKeys every resolver input that led here. `resolveUri` recurses
 * through `resolveLibraryAssetUri`, so an asset id and the uri it points at end
 * up as separate `uriCache` keys backed by one object URL; a revoke has to
 * invalidate all of them.
 */
async function resolveUri(uri: string, aliasKeys: readonly string[] = [uri]): Promise<string | number | null> {
  try {
    // Checked before anything else: in a published bundle the packaged file is
    // the only copy that exists, so every other branch below would be looking
    // for something that was never shipped.
    const packaged = packagedMediaByReference?.[uri];
    if (packaged) return resolveWebUrl(packaged);

    if (uri.startsWith('data:')) {
      if (!isSafeDataUri(uri)) {
        ErrorHandler.handle('Blocked unsafe data URI', null, ErrorCategory.VALIDATION, ErrorSeverity.LOW, { uri: uri.slice(0, 80) });
        return null;
      }
      return uri;
    }

    if (uri.startsWith(IDB_MEDIA_URI_PREFIX)) {
      return resolveIndexedDbMediaUri(uri, aliasKeys);
    }

    const libraryUri = resolveLibraryAssetUri(uri);
    if (libraryUri && libraryUri !== uri) {
      return resolveUri(libraryUri, [...aliasKeys, libraryUri]);
    }

    if (!isSafeUri(uri)) {
      ErrorHandler.handle('Blocked unsafe URI', null, ErrorCategory.VALIDATION, ErrorSeverity.LOW, { uri });
      return null;
    }
    // Path traversal check for file paths
    if (!isPathSafe(uri)) {
      ErrorHandler.handle('Blocked unsafe path', null, ErrorCategory.VALIDATION, ErrorSeverity.LOW, { uri });
      return null;
    }

    // ALWAYS try to find in bundled assets first, regardless of prefix
    const bundled = getBundledAsset(uri);
    if (bundled) {
      return moduleIdToUri(bundled);
    }

    // Blob URIs are safe (created by the browser/runtime)
    if (uri.startsWith('blob:')) return uri;

    // data: URIs — only allow safe media types (image, audio, video)
    // If it already looks like a valid file URI, verify it exists
    if (uri.startsWith('file://') || uri.startsWith('/')) {
      const isMediaLibraryPath = uri.includes('media-library');
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) return uri;
      } catch {
        // getInfoAsync can fail on web — fall through
      }
      if (isMediaLibraryPath) return uri;
    }

    // Check if it's an http(s) URI
    if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;

    // Try as a relative path from the document directory
    if (FileSystem.documentDirectory) {
      const docPath = `${FileSystem.documentDirectory}${uri}`;
      try {
        const docInfo = await FileSystem.getInfoAsync(docPath);
        if (docInfo.exists) return docPath;
      } catch { /* continue */ }
    }

    // Try as a relative path from the caches directory
    if (FileSystem.cacheDirectory) {
      const cachePath = `${FileSystem.cacheDirectory}${uri}`;
      try {
        const cacheInfo = await FileSystem.getInfoAsync(cachePath);
        if (cacheInfo.exists) return cachePath;
      } catch { /* continue */ }
    }

    if (uri.startsWith('assets/')) {
      ErrorHandler.handle(
        'Bundled asset was not emitted by the compiled asset map',
        null,
        ErrorCategory.VALIDATION,
        ErrorSeverity.LOW,
        { uri },
      );
      return null;
    }

    ErrorHandler.handle('Could not verify URI, using as-is', null, ErrorCategory.VALIDATION, ErrorSeverity.LOW, { uri });
    return uri;
  } catch (error) {
    ErrorHandler.handle('Error resolving asset URI', error, ErrorCategory.MEDIA, ErrorSeverity.LOW, { uri });
    return uri;
  }
}

/**
 * Resolve a URI to a string playable by expo-audio (createAudioPlayer).
 * Bundled require() modules are converted via Asset.fromModule.
 */
export async function resolvePlayableAssetUri(uri: string | undefined): Promise<string | null> {
  if (!uri) return null;

  const cached = getTimedCacheEntry(playableUriCache, uri);
  if (cached) return cached;

  const promise = resolvePlayableUri(uri);
  setTimedCacheEntry(playableUriCache, uri, promise);
  return promise;
}

async function resolvePlayableUri(uri: string): Promise<string | null> {
  try {
    const resolved = await resolveAssetUri(uri);
    if (resolved === null) return null;
    if (typeof resolved === 'string') {
      if (Platform.OS === 'web') {
        return getBrowserSafeAudioUri(resolved);
      }
      return resolved;
    }
    return moduleIdToPlayableUri(resolved);
  } catch (error) {
    ErrorHandler.handle('Error resolving playable asset URI', error, ErrorCategory.MEDIA, ErrorSeverity.LOW, { uri });
    return null;
  }
}

async function moduleIdToPlayableUri(moduleId: number): Promise<string | null> {
  const cached = modulePlayableCache.get(moduleId);
  if (cached) return cached;

  const playable = await moduleIdToUri(moduleId);
  if (playable) {
    evictOldest(modulePlayableCache, MODULE_CACHE_MAX_SIZE);
    modulePlayableCache.set(moduleId, playable);
  }
  return playable;
}

async function moduleIdToUri(moduleId: number): Promise<string | null> {
  const cached = moduleUriCache.get(moduleId);
  if (cached) return cached;

  try {
    const asset = Asset.fromModule(moduleId);
    if (!asset.localUri) await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri ?? null;
    if (uri) {
      evictOldest(moduleUriCache, MODULE_CACHE_MAX_SIZE);
      moduleUriCache.set(moduleId, uri);
    }
    return uri;
  } catch (error) {
    ErrorHandler.handle('Failed to resolve bundled module URI', error, ErrorCategory.MEDIA, ErrorSeverity.LOW);
    return null;
  }
}

/**
 * A lease on a resolved asset. While one is held the resolver will not revoke
 * the object URL behind `source`, even under cache pressure.
 */
export interface ResolvedAssetLease {
  /** Ready to hand to a player or an image; `null` when resolution failed. */
  source: string | number | null;
  /** Idempotent. Drops the pin only — the URL stays cached until normal eviction. */
  release: () => void;
}

/**
 * Resolve an asset and pin it for as long as the caller needs it.
 *
 * Use this instead of `resolveAssetUri` whenever the resolved value is held
 * across time — a mounted video player, a long-lived preview. Thumbnails and
 * other resolve-and-forget callers do not need a lease.
 *
 * Only IndexedDB-backed media is ref-counted; for `http`, `file`, `data` and
 * bundled modules the lease is a free wrapper with a no-op release.
 */
export async function acquireResolvedAssetUri(assetRef: string | undefined): Promise<ResolvedAssetLease> {
  const source = await resolveAssetUri(assetRef);
  const storageKey = assetRef ? storageKeyByAlias.get(assetRef) : undefined;
  if (!storageKey) return { source, release: () => {} };

  mediaLeaseCounts.set(storageKey, (mediaLeaseCounts.get(storageKey) ?? 0) + 1);
  let released = false;
  return {
    source,
    release: () => {
      if (released) return;
      released = true;
      const remaining = (mediaLeaseCounts.get(storageKey) ?? 1) - 1;
      if (remaining > 0) mediaLeaseCounts.set(storageKey, remaining);
      else mediaLeaseCounts.delete(storageKey);
    },
  };
}

/**
 * Test-only. Production code must never call this: it revokes every object URL
 * regardless of leases, which would break any player holding one. A cache reset
 * that honoured leases would not be a reset, so the two are kept apart by name.
 */
export function resetAssetResolverForTests(): void {
  if (typeof URL.revokeObjectURL === 'function') {
    mediaObjectUrlCache.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  }
  mediaObjectUrlCache.clear();
  mediaObjectUrlPromises.clear();
  mediaAliasKeys.clear();
  storageKeyByAlias.clear();
  mediaLeaseCounts.clear();
  pinnedEvictionWarned = false;
  packagedMediaByReference = null;
  uriCache.clear();
  playableUriCache.clear();
  moduleUriCache.clear();
  modulePlayableCache.clear();
}

/**
 * Copy an asset to permanent storage (media library)
 */
export async function copyAssetToPermanentStorage(
  sourceUri: string,
  assetType: 'image' | 'audio' | 'video'
): Promise<string> {
  try {
    const filename = sourceUri.split('/').pop() || 'asset';
    const extMap: Record<string, string> = { image: '.png', audio: '.mp3', video: '.mp4' };
    const ext = filename.match(/\.[^.]+$/) ? '' : (extMap[assetType] || '.bin');
    const targetPath = `${FileSystem.documentDirectory}media-library/${assetType}s/${filename}${ext}`;

    const dirPath = `${FileSystem.documentDirectory}media-library/${assetType}s/`;
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });

    // Don't copy if it's already in the target location
    if (sourceUri === targetPath) {
      return targetPath;
    }

    await FileSystem.copyAsync({ from: sourceUri, to: targetPath });
    return targetPath;
  } catch (error) {
    ErrorHandler.handle('Failed to copy asset', error, ErrorCategory.MEDIA, ErrorSeverity.LOW, { sourceUri });
    // Return original if copy fails
    return sourceUri;
  }
}
