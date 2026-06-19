/**
 * Asset Resolver
 * Handles resolution of bundled and external asset URIs
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '@/lib/error-handler';
import { getBrowserSafeAudioUri } from './audio-web-source';
import { resolveLibraryAssetUri } from '@/stores/media-library-actions';
import { isSafeUri } from './story-validator';

type TimedCacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const uriCache = new Map<string, TimedCacheEntry<string | number | null>>();
const playableUriCache = new Map<string, TimedCacheEntry<string | null>>();
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

// Bundled assets mapping - maps asset IDs to actual asset locations
const BUNDLED_ASSETS: Record<string, number> = {
  // Background assets - full paths
  'assets/background/bg-ancient-library.png': require('../assets/background/bg-ancient-library.png'),
  'assets/background/bg-grand-hall.png': require('../assets/background/bg-grand-hall.png'),
  'assets/background/bg-hall-mirrors.png': require('../assets/background/bg-hall-mirrors.png'),
  'assets/background/bg-museum-entrance.png': require('../assets/background/bg-museum-entrance.png'),
  'assets/background/bg-treasure-chamber.png': require('../assets/background/bg-treasure-chamber.png'),
  'assets/background/bg-upper-library.png': require('../assets/background/bg-upper-library.png'),

  // Background assets - short names
  'bg-ancient-library': require('../assets/background/bg-ancient-library.png'),
  'bg-grand-hall': require('../assets/background/bg-grand-hall.png'),
  'bg-hall-mirrors': require('../assets/background/bg-hall-mirrors.png'),
  'bg-museum-entrance': require('../assets/background/bg-museum-entrance.png'),
  'bg-treasure-chamber': require('../assets/background/bg-treasure-chamber.png'),
  'bg-upper-library': require('../assets/background/bg-upper-library.png'),

  // Character assets
  'assets/charakters/char-guide.png': require('../assets/charakters/char-guide.png'),
  'assets/charakters/char-librarian.png': require('../assets/charakters/char-librarian.png'),
  'assets/charakters/char-reflection.png': require('../assets/charakters/char-reflection.png'),
  'char-guide': require('../assets/charakters/char-guide.png'),
  'char-librarian': require('../assets/charakters/char-librarian.png'),
  'char-reflection': require('../assets/charakters/char-reflection.png'),

  // Splash screen assets
  'assets/splash-screens/splash-chapter1.png': require('../assets/splash-screens/splash-chapter1.png'),
  'assets/splash-screens/splash-title.png': require('../assets/splash-screens/splash-title.png'),
  'assets/splash-screens/splash-victory.png': require('../assets/splash-screens/splash-victory.png'),
  'splash-chapter1': require('../assets/splash-screens/splash-chapter1.png'),
  'splash-title': require('../assets/splash-screens/splash-title.png'),
  'splash-victory': require('../assets/splash-screens/splash-victory.png'),

  // Audio assets
  'assets/sounds-sample/music-eerie.mp3': require('../assets/sounds-sample/music-eerie.mp3'),
  'assets/sounds-sample/music-magical.mp3': require('../assets/sounds-sample/music-magical.mp3'),
  'assets/sounds-sample/music-mysterious-adventure.mp3': require('../assets/sounds-sample/music-mysterious-adventure.mp3'),
  'assets/sounds-sample/music-peaceful.mp3': require('../assets/sounds-sample/music-peaceful.mp3'),
  'assets/sounds-sample/music-triumphant.mp3': require('../assets/sounds-sample/music-triumphant.mp3'),
  'assets/sounds-sample/sfx-door-open.mp3': require('../assets/sounds-sample/sfx-door-open.mp3'),
  'assets/sounds-sample/sfx-item-get-special.mp3': require('../assets/sounds-sample/sfx-item-get-special.mp3'),
  'assets/sounds-sample/sfx-item-get.mp3': require('../assets/sounds-sample/sfx-item-get.mp3'),
  'assets/sounds-sample/sfx-stairs.mp3': require('../assets/sounds-sample/sfx-stairs.mp3'),
  'assets/sounds-sample/voice-guide-welcome.mp3': require('../assets/sounds-sample/voice-guide-welcome.mp3'),
};

/**
 * Get a bundled asset by ID
 */
export function getBundledAsset(assetId: string): number | null {
  if (!assetId) return null;

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

async function resolveUri(uri: string): Promise<string | number | null> {
  try {
    if (uri.startsWith('data:')) {
      if (!isSafeDataUri(uri)) {
        ErrorHandler.handle('Blocked unsafe data URI', null, ErrorCategory.VALIDATION, ErrorSeverity.LOW, { uri: uri.slice(0, 80) });
        return null;
      }
      return uri;
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

    const libraryUri = resolveLibraryAssetUri(uri);
    if (libraryUri && libraryUri !== uri) {
      return resolveUri(libraryUri);
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

    if (uri.startsWith('assets/')) return uri;

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

export function clearUriCache(): void {
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
