/**
 * Read-only image tools for the AI assistant.
 *
 * These let the model pick an existing assetId for background / sprite /
 * interactive-object blocks instead of inventing one. Deliberately thin: all
 * matching (including uri-aliased references) is delegated to lib/asset-usage.
 *
 * Asset URIs are never sent to the model — a stored image can be a multi-megabyte
 * data: URI, and the model only ever needs the id to reference it.
 */
import {
  buildAssetUsageReport,
  collectAssetReferences,
  type AssetUsageKind,
  type AvailableAsset,
} from '@/lib/asset-usage';
import { getStoryImageAssets } from '@/lib/story-image-library';
import type { AppState } from '@/stores/app-store-types';
import { useAppStore } from '@/stores/use-app-store';

export type AiAssetToolsSnapshot = Pick<
  AppState,
  'sceneRecordsByStory' | 'mediaLibrary' | 'imageAssetIdsByStory'
>;

export type UriKind = 'file' | 'data' | 'remote';

export interface AiImageAsset {
  id: string;
  name: string;
  /** How the image is stored. The URI itself is withheld on purpose. */
  uriKind: UriKind;
  usageCount: number;
}

export interface AiAssetUsageReference {
  sceneId: string;
  sceneName: string;
  stepId: string;
  kind: AssetUsageKind;
  enabled: boolean;
}

export interface AiImageDetails extends AiImageAsset {
  addedAt: number;
  usedIn: AiAssetUsageReference[];
}

function classifyUri(uri: string): UriKind {
  if (uri.startsWith('data:')) return 'data';
  if (/^https?:\/\//i.test(uri)) return 'remote';
  return 'file';
}

function storyScenes(snapshot: AiAssetToolsSnapshot, storyId: string) {
  return Object.values(snapshot.sceneRecordsByStory[storyId] ?? {});
}

/** Story images as AvailableAsset, keeping the uri alias so uri-based references still match. */
function availableImages(snapshot: AiAssetToolsSnapshot, storyId: string): AvailableAsset[] {
  return getStoryImageAssets(storyId, snapshot.imageAssetIdsByStory, snapshot.mediaLibrary).map((asset) => ({
    id: asset.id,
    kind: 'background' as const,
    name: asset.name,
    aliases: [asset.uri],
  }));
}

function usageByAssetId(snapshot: AiAssetToolsSnapshot, storyId: string) {
  const scenes = storyScenes(snapshot, storyId);
  const sceneNameById = new Map(scenes.map((scene) => [scene.id, scene.name]));
  const report = buildAssetUsageReport(collectAssetReferences(scenes), availableImages(snapshot, storyId));

  return new Map(
    report.assets.map((usage) => [
      usage.asset.id,
      usage.references.map<AiAssetUsageReference>((reference) => ({
        sceneId: reference.sceneId,
        sceneName: sceneNameById.get(reference.sceneId) ?? reference.sceneId,
        stepId: reference.stepId,
        kind: reference.kind,
        enabled: reference.enabled,
      })),
    ]),
  );
}

export function listStoryImagesFromSnapshot(snapshot: AiAssetToolsSnapshot, storyId: string): AiImageAsset[] {
  const usage = usageByAssetId(snapshot, storyId);

  return getStoryImageAssets(storyId, snapshot.imageAssetIdsByStory, snapshot.mediaLibrary).map((asset) => ({
    id: asset.id,
    name: asset.name,
    uriKind: classifyUri(asset.uri),
    usageCount: usage.get(asset.id)?.length ?? 0,
  }));
}

export function getImageDetailsFromSnapshot(
  snapshot: AiAssetToolsSnapshot,
  storyId: string,
  assetId: string,
): AiImageDetails | null {
  const asset = getStoryImageAssets(storyId, snapshot.imageAssetIdsByStory, snapshot.mediaLibrary)
    .find((item) => item.id === assetId);
  if (!asset) return null;

  const usedIn = usageByAssetId(snapshot, storyId).get(assetId) ?? [];
  return {
    id: asset.id,
    name: asset.name,
    uriKind: classifyUri(asset.uri),
    usageCount: usedIn.length,
    addedAt: asset.addedAt,
    usedIn,
  };
}

export function findAssetUsageFromSnapshot(
  snapshot: AiAssetToolsSnapshot,
  storyId: string,
  assetId: string,
): AiAssetUsageReference[] | null {
  const usage = usageByAssetId(snapshot, storyId);
  return usage.has(assetId) ? usage.get(assetId) ?? [] : null;
}

export function listStoryImages(storyId: string): AiImageAsset[] {
  return listStoryImagesFromSnapshot(useAppStore.getState(), storyId);
}

export function getImageDetails(storyId: string, assetId: string): AiImageDetails | null {
  return getImageDetailsFromSnapshot(useAppStore.getState(), storyId, assetId);
}

export function findAssetUsage(storyId: string, assetId: string): AiAssetUsageReference[] | null {
  return findAssetUsageFromSnapshot(useAppStore.getState(), storyId, assetId);
}
