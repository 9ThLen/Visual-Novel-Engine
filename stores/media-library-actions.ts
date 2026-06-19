/**
 * Media Library Store Actions
 *
 * Store-aware wrappers for media-library operations.
 * This file is in stores/ and can safely import useAppStore.
 *
 * NOTE: Extracted from lib/media-library-service.ts to resolve the layer boundary
 * violation (lib/ should not import from stores/).
 */

import { useAppStore } from './use-app-store';
import {
  addAssetToLibraryPure,
  getLibraryAssetById as getLibraryAssetByIdPure,
  resolveLibraryAssetUri as resolveLibraryAssetUriPure,
} from '@/lib/media-library-service';
import type { LibraryAsset } from '@/lib/media-library-service';

export function getLibraryAssets(): LibraryAsset[] {
  return useAppStore.getState().mediaLibrary;
}

export function setLibraryAssets(assets: LibraryAsset[]): void {
  useAppStore.getState().setMediaLibrary(assets);
}

export function getLibraryAssetById(assetId: string): LibraryAsset | undefined {
  return getLibraryAssetByIdPure(assetId, useAppStore.getState().mediaLibrary);
}

export function resolveLibraryAssetUri(assetRef: string | null | undefined): string | null {
  return resolveLibraryAssetUriPure(assetRef, useAppStore.getState().mediaLibrary);
}

export async function addAssetToLibrary(
  uri: string,
  name: string,
  type: LibraryAsset['type'],
): Promise<LibraryAsset> {
  const assets = useAppStore.getState().mediaLibrary;
  const result = await addAssetToLibraryPure(uri, name, type, assets);
  useAppStore.getState().setMediaLibrary(result.assets);
  return result.asset;
}
