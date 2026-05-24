import * as FileSystem from 'expo-file-system/legacy';
import { useAppStore } from '@/stores/use-app-store';
import { generateAssetId } from './id-utils';

export type AssetType = 'image' | 'audio';

export interface LibraryAsset {
  id: string;
  type: AssetType;
  uri: string;
  name: string;
  addedAt: number;
}

export async function getLibraryAssets(): Promise<LibraryAsset[]> {
  return useAppStore.getState().mediaLibrary;
}

export function setLibraryAssets(assets: LibraryAsset[]): void {
  useAppStore.getState().setMediaLibrary(assets);
}

export function getLibraryAssetById(
  assetId: string,
  assets: LibraryAsset[] = useAppStore.getState().mediaLibrary
): LibraryAsset | undefined {
  return assets.find((asset) => asset.id === assetId);
}

export function resolveLibraryAssetUri(
  assetRef: string | null | undefined,
  assets: LibraryAsset[] = useAppStore.getState().mediaLibrary
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

export async function addAssetToLibrary(
  uri: string,
  name: string,
  type: AssetType
): Promise<LibraryAsset> {
  const assets = await getLibraryAssets();
  const filename = name || uri.split('/').pop() || `asset-${Date.now()}`;
  const ext = filename.includes('.') ? '' : (type === 'image' ? '.png' : '.mp3');
  const fullFilename = filename.includes('.') ? filename : `${filename}${ext}`;

  const existingByUri = assets.find((a) => a.uri === uri);
  if (existingByUri) {
    if (__DEV__) console.log('[MediaLibrary] Reusing existing asset by URI');
    return existingByUri;
  }

  const existingByName = assets.find((a) => a.name === name || a.name === filename);
  if (existingByName && existingByName.uri.includes('media-library')) {
    try {
      const info = await FileSystem.getInfoAsync(existingByName.uri);
      if (info.exists) {
        if (__DEV__) console.log('[MediaLibrary] Reusing existing asset by name:', existingByName.name);
        return existingByName;
      }
    } catch (e) {
    }
  }

  if (uri.startsWith('assets/') || uri.startsWith('bundle://')) {
    const asset: LibraryAsset = {
      id: generateAssetId(),
      type,
      uri,
      name: name || filename,
      addedAt: Date.now()
    };
    setLibraryAssets([...assets, asset]);
    return asset;
  }

  if (!FileSystem.documentDirectory) {
    if (__DEV__) console.warn('[MediaLibrary] Document directory not available, using original URI');
    const asset: LibraryAsset = {
      id: generateAssetId(),
      type,
      uri,
      name: name || filename,
      addedAt: Date.now()
    };
    setLibraryAssets([...assets, asset]);
    return asset;
  }

  const targetPath = `${FileSystem.documentDirectory}media-library/${type}s/${fullFilename}`;
  const dirPath = `${FileSystem.documentDirectory}media-library/${type}s/`;

  try {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  } catch {
  }

  const checkTarget = await FileSystem.getInfoAsync(targetPath);
  if (checkTarget.exists) {
    if (__DEV__) console.log('[MediaLibrary] File already exists in storage, reusing:', targetPath);
    const asset: LibraryAsset = {
      id: generateAssetId(),
      type,
      uri: targetPath,
      name: name || filename,
      addedAt: Date.now()
    };
    setLibraryAssets([...assets, asset]);
    return asset;
  }

  let copySucceeded = false;
  try {
    if (__DEV__) console.log('[MediaLibrary] Copying file from:', uri, 'to:', targetPath);
    await FileSystem.copyAsync({ from: uri, to: targetPath });

    const verifyInfo = await FileSystem.getInfoAsync(targetPath);
    if (verifyInfo.exists && verifyInfo.size > 0) {
      copySucceeded = true;
      if (__DEV__) console.log('[MediaLibrary] File copied successfully, size:', verifyInfo.size);
    } else {
      if (__DEV__) console.warn('[MediaLibrary] Copy appeared to succeed but file is missing or empty');
    }
  } catch (copyErr) {
    if (__DEV__) console.warn('[MediaLibrary] copyAsync failed, trying read/write fallback:', copyErr);

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
        if (__DEV__) console.log('[MediaLibrary] Fallback copy succeeded, size:', verifyInfo.size);
      }
    } catch (fallbackErr) {
      if (__DEV__) console.error('[MediaLibrary] Fallback copy also failed:', fallbackErr);
    }
  }

  if (copySucceeded) {
    const asset: LibraryAsset = {
      id: generateAssetId(),
      type,
      uri: targetPath,
      name: name || filename,
      addedAt: Date.now()
    };
    setLibraryAssets([...assets, asset]);
    return asset;
  }

  if (__DEV__) console.error('[MediaLibrary] All copy attempts failed, saving with original URI');
  const asset: LibraryAsset = {
    id: generateAssetId(),
    type,
    uri,
    name: name || filename,
    addedAt: Date.now()
  };
  setLibraryAssets([...assets, asset]);
  return asset;
}
