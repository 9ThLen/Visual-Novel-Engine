/**
 * Asset Resolver
 * Handles resolution of bundled and external asset URIs
 */

import * as FileSystem from 'expo-file-system/legacy';

// Bundled assets mapping - maps asset IDs to actual asset locations
const BUNDLED_ASSETS: Record<string, any> = {
  // Background assets - full paths (from demo-story.json)
  'assets/background/bg-ancient-library.png': require('@/assets/background/bg-ancient-library.png'),
  'assets/background/bg-grand-hall.png': require('@/assets/background/bg-grand-hall.png'),
  'assets/background/bg-hall-mirrors.png': require('@/assets/background/bg-hall-mirrors.png'),
  'assets/background/bg-museum-entrance.png': require('@/assets/background/bg-museum-entrance.png'),
  'assets/background/bg-treasure-chamber.png': require('@/assets/background/bg-treasure-chamber.png'),
  'assets/background/bg-upper-library.png': require('@/assets/background/bg-upper-library.png'),

  // Background assets - short names
  'bg-ancient-library': require('@/assets/background/bg-ancient-library.png'),
  'bg-grand-hall': require('@/assets/background/bg-grand-hall.png'),
  'bg-hall-mirrors': require('@/assets/background/bg-hall-mirrors.png'),
  'bg-museum-entrance': require('@/assets/background/bg-museum-entrance.png'),
  'bg-treasure-chamber': require('@/assets/background/bg-treasure-chamber.png'),
  'bg-upper-library': require('@/assets/background/bg-upper-library.png'),

  // Character assets
  'assets/charakters/char-guide.png': require('@/assets/charakters/char-guide.png'),
  'assets/charakters/char-librarian.png': require('@/assets/charakters/char-librarian.png'),
  'assets/charakters/char-reflection.png': require('@/assets/charakters/char-reflection.png'),
  'char-guide': require('@/assets/charakters/char-guide.png'),
  'char-librarian': require('@/assets/charakters/char-librarian.png'),
  'char-reflection': require('@/assets/charakters/char-reflection.png'),
};

/**
 * Get a bundled asset by ID
 * Returns the asset directly if found (can be used with Image source)
 */
export function getBundledAsset(assetId: string): any {
  if (!assetId) return null;

  // Try direct lookup first (exact match)
  if (BUNDLED_ASSETS[assetId]) {
    return BUNDLED_ASSETS[assetId];
  }

  // Try removing 'bundle://' prefix
  const cleaned = assetId.replace('bundle://', '');
  if (BUNDLED_ASSETS[cleaned]) {
    return BUNDLED_ASSETS[cleaned];
  }

  // Try to find by filename (e.g., "bg-ancient-library.png" -> full path)
  for (const [key, value] of Object.entries(BUNDLED_ASSETS)) {
    if (key.endsWith(assetId) || assetId.endsWith(key.split('/').pop() || '')) {
      return value;
    }
  }

  return null;
}

/**
 * Resolve an asset URI
 * Handles both local files and external URIs
 * Returns a string URI that can be used with expo-image or audio players
 */
export async function resolveAssetUri(uri: string | undefined): Promise<string | null> {
  if (!uri) return null;

  try {
    // If it's a bundled asset reference, try to resolve it
    if (uri.startsWith('bundle://')) {
      const assetId = uri.replace('bundle://', '');
      const bundled = getBundledAsset(assetId);
      if (bundled) {
        return bundled;
      }
    }

    // If it already looks like a valid file URI, verify it exists
    if (uri.startsWith('file://') || uri.startsWith('/')) {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        return uri;
      }
    }

    // Check if it's an http(s) URI
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri;
    }

    // Try as a relative path from the caches directory
    const cachePath = `${FileSystem.cacheDirectory}${uri}`;
    try {
      const cacheInfo = await FileSystem.getInfoAsync(cachePath);
      if (cacheInfo.exists) {
        return cachePath;
      }
    } catch {
      // Cache path doesn't exist, continue
    }

    // If it looks like an asset path (assets/...), return it as-is since it might be a static asset
    if (uri.startsWith('assets/')) {
      return uri;
    }

    // If all else fails, return null to indicate resource couldn't be resolved
    return null;
  } catch (error) {
    console.error('[AssetResolver] Error resolving asset URI:', uri, error);
    return null;
  }
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
    const ext = filename.match(/\.[^.]+$/) ? '' : (assetType === 'image' ? '.png' : '.mp3');
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
    console.error('[AssetResolver] Failed to copy asset:', error);
    // Return original if copy fails
    return sourceUri;
  }
}
