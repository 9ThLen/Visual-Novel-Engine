/**
 * Media Library Service
 * Manages media assets (images, audio) for stories.
 *
 * NOTE: This file contains only pure functions. Store access is in
 * stores/media-library-actions.ts. This resolves the layer boundary
 * violation (lib/ should not import from stores/).
 */

import * as FileSystem from 'expo-file-system/legacy';
import { generateAssetId } from './id-utils';

export type AssetType = 'image' | 'audio';

export interface LibraryAsset {
  id: string;
  type: AssetType;
  uri: string;
  name: string;
  addedAt: number;
}

/**
 * Get library asset by ID (pure function)
 */
export function getLibraryAssetById(
  assetId: string,
  assets: LibraryAsset[],
): LibraryAsset | undefined {
  return assets.find((asset) => asset.id === assetId);
}

/**
 * Resolve library asset URI (pure function)
 */
export function resolveLibraryAssetUri(
  assetRef: string | null | undefined,
  assets: LibraryAsset[],
): string | null {
  if (!assetRef) {
    return null;
  }
  const isUriLike = /^(file|content|blob|data|https?):/i.test(assetRef) || assetRef.startsWith('/') || assetRef.startsWith('assets/');
  if (isUriLike) {
    return assetRef;
  }
  return getLibraryAssetById(assetRef, assets)?.uri ?? null;
}

/**
 * Add asset to library (pure function — returns new asset and updated list)
 */
export async function addAssetToLibraryPure(
  uri: string,
  name: string,
  type: AssetType,
  assets: LibraryAsset[],
): Promise<{ asset: LibraryAsset; assets: LibraryAsset[] }> {
  const filename = name || uri.split('/').pop() || `asset-${Date.now()}`;
  const ext = filename.includes('.') ? '' : (type === 'image' ? '.png' : '.mp3');
  const fullFilename = filename.includes('.') ? filename : `${filename}${ext}`;

  const existingByUri = assets.find((a) => a.uri === uri);
  if (existingByUri) {
    return { asset: existingByUri, assets };
  }

  const existingByName = assets.find((a) => a.name === name || a.name === filename);
  if (existingByName && existingByName.uri.includes('media-library')) {
    try {
      const info = await FileSystem.getInfoAsync(existingByName.uri);
      if (info.exists) {
        return { asset: existingByName, assets };
      }
    } catch {
    }
  }

  if (uri.startsWith('assets/') || uri.startsWith('bundle://')) {
    const asset: LibraryAsset = {
      id: generateAssetId(),
      type,
      uri,
      name: name || filename,
      addedAt: Date.now(),
    };
    return { asset, assets: [...assets, asset] };
  }

  if (!FileSystem.documentDirectory) {
    const asset: LibraryAsset = {
      id: generateAssetId(),
      type,
      uri,
      name: name || filename,
      addedAt: Date.now(),
    };
    return { asset, assets: [...assets, asset] };
  }

  const targetPath = `${FileSystem.documentDirectory}media-library/${type}s/${fullFilename}`;
  const dirPath = `${FileSystem.documentDirectory}media-library/${type}s/`;

  try {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  } catch {
  }

  const checkTarget = await FileSystem.getInfoAsync(targetPath);
  if (checkTarget.exists) {
    const asset: LibraryAsset = {
      id: generateAssetId(),
      type,
      uri: targetPath,
      name: name || filename,
      addedAt: Date.now(),
    };
    return { asset, assets: [...assets, asset] };
  }

  let copySucceeded = false;
  try {
    await FileSystem.copyAsync({ from: uri, to: targetPath });
    const verifyInfo = await FileSystem.getInfoAsync(targetPath);
    if (verifyInfo.exists && verifyInfo.size > 0) {
      copySucceeded = true;
    }
  } catch {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(targetPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const verifyInfo = await FileSystem.getInfoAsync(targetPath);
      if (verifyInfo.exists && verifyInfo.size > 0) {
        copySucceeded = true;
      }
    } catch {
    }
  }

  if (copySucceeded) {
    const asset: LibraryAsset = {
      id: generateAssetId(),
      type,
      uri: targetPath,
      name: name || filename,
      addedAt: Date.now(),
    };
    return { asset, assets: [...assets, asset] };
  }

  const asset: LibraryAsset = {
    id: generateAssetId(),
    type,
    uri,
    name: name || filename,
    addedAt: Date.now(),
  };
  return { asset, assets: [...assets, asset] };
}
