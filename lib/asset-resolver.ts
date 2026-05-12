/**
 * Asset Resolver
 * Handles resolution of bundled and external asset URIs
 */

import * as FileSystem from 'expo-file-system/legacy';

// Bundled assets mapping - maps asset IDs to actual asset locations
const BUNDLED_ASSETS: Record<string, any> = {
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
export function getBundledAsset(assetId: string): any {
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
export async function resolveAssetUri(uri: string | undefined): Promise<any> {
  if (!uri) return null;

  try {
    // ALWAYS try to find in bundled assets first, regardless of prefix
    const bundled = getBundledAsset(uri);
    if (bundled) {
      return bundled;
    }

    // Blob and data URIs are valid sources — return directly
    if (uri.startsWith('blob:') || uri.startsWith('data:')) {
      return uri;
    }

    // If it already looks like a valid file URI, verify it exists
    if (uri.startsWith('file://') || uri.startsWith('/')) {
      // For media-library paths, try to verify but trust them even if check fails
      const isMediaLibraryPath = uri.includes('media-library');

      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) {
          if (__DEV__) console.log('[AssetResolver] File verified:', uri);
          return uri;
        }
      } catch {
        // getInfoAsync can fail on web — fall through
      }

      // Trust media-library paths even if getInfoAsync failed (common on web/OPFS)
      if (isMediaLibraryPath) {
        if (__DEV__) console.log('[AssetResolver] Trusting media-library path:', uri);
        return uri;
      }
    }

    // Check if it's an http(s) URI
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri;
    }

    // Try as a relative path from the document directory
    if (FileSystem.documentDirectory) {
      const docPath = `${FileSystem.documentDirectory}${uri}`;
      try {
        const docInfo = await FileSystem.getInfoAsync(docPath);
        if (docInfo.exists) {
          return docPath;
        }
      } catch {
        // Continue
      }
    }

    // Try as a relative path from the caches directory
    if (FileSystem.cacheDirectory) {
      const cachePath = `${FileSystem.cacheDirectory}${uri}`;
      try {
        const cacheInfo = await FileSystem.getInfoAsync(cachePath);
        if (cacheInfo.exists) {
          return cachePath;
        }
      } catch {
        // Cache path doesn't exist, continue
      }
    }

    // If it looks like an asset path (assets/...), return it as-is
    if (uri.startsWith('assets/')) {
      return uri;
    }

    // Fallback: return the URI as-is rather than losing it entirely.
    // The Image / Audio component will handle load errors gracefully.
    if (__DEV__) console.warn('[AssetResolver] Could not verify URI, using as-is:', uri);
    return uri;
  } catch (error) {
    if (__DEV__) console.error('[AssetResolver] Error resolving asset URI:', uri, error);
    // Return the URI anyway so the component can attempt to load it
    return uri;
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
    if (__DEV__) console.error('[AssetResolver] Failed to copy asset:', error);
    // Return original if copy fails
    return sourceUri;
  }
}
