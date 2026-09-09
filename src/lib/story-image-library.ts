import type { BackgroundBlockData, SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';

export type StoryImageAssetIds = Record<string, string[]>;

function uniqueAssetIds(assetIds: unknown): string[] {
  if (!Array.isArray(assetIds)) return [];
  return Array.from(new Set(assetIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
}

export function normalizeStoryImageAssetIds(value: unknown): StoryImageAssetIds {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([storyId]) => storyId.trim().length > 0)
      .map(([storyId, assetIds]) => [storyId, uniqueAssetIds(assetIds)]),
  );
}

export function getStoryImageAssets(
  storyId: string,
  imageAssetIdsByStory: StoryImageAssetIds,
  mediaLibrary: LibraryAsset[],
): LibraryAsset[] {
  const assetById = new Map(
    mediaLibrary
      .filter((asset) => asset.type === 'image')
      .map((asset) => [asset.id, asset]),
  );

  return uniqueAssetIds(imageAssetIdsByStory[storyId])
    .map((assetId) => assetById.get(assetId))
    .filter((asset): asset is LibraryAsset => Boolean(asset));
}

export function getStoryGalleryImageAssets(
  storyId: string,
  imageAssetIdsByStory: StoryImageAssetIds,
  mediaLibrary: LibraryAsset[],
  scenes: SceneRecord[],
): LibraryAsset[] {
  const imageByReference = new Map<string, LibraryAsset>();
  mediaLibrary.filter((asset) => asset.type === 'image').forEach((asset) => {
    imageByReference.set(asset.id, asset);
    imageByReference.set(asset.uri, asset);
  });
  const referenced = scenes.flatMap((scene) => scene.timeline ?? [])
    .filter((step) => step.blockType === 'background')
    .map((step) => imageByReference.get((step.data as BackgroundBlockData).assetId ?? ''))
    .filter((asset): asset is LibraryAsset => Boolean(asset));
  return Array.from(new Map([
    ...getStoryImageAssets(storyId, imageAssetIdsByStory, mediaLibrary),
    ...referenced,
  ].map((asset) => [asset.id, asset])).values());
}

export function addImageAssetToStory(
  imageAssetIdsByStory: StoryImageAssetIds,
  storyId: string,
  assetId: string,
): StoryImageAssetIds {
  if (!storyId || !assetId) return imageAssetIdsByStory;
  const current = uniqueAssetIds(imageAssetIdsByStory[storyId]);
  if (current.includes(assetId)) return imageAssetIdsByStory;

  return {
    ...imageAssetIdsByStory,
    [storyId]: [...current, assetId],
  };
}

export function removeImageAssetFromStory(
  imageAssetIdsByStory: StoryImageAssetIds,
  storyId: string,
  assetId: string,
): StoryImageAssetIds {
  const current = uniqueAssetIds(imageAssetIdsByStory[storyId]);
  if (!current.includes(assetId)) return imageAssetIdsByStory;

  const next = current.filter((id) => id !== assetId);
  return { ...imageAssetIdsByStory, [storyId]: next };
}

function referencedImageAssetIds(
  scenesByStory: Record<string, Record<string, SceneRecord>>,
  mediaLibrary: LibraryAsset[],
): StoryImageAssetIds {
  const imageIdByReference = new Map<string, string>();
  mediaLibrary
    .filter((asset) => asset.type === 'image')
    .forEach((asset) => {
      imageIdByReference.set(asset.id, asset.id);
      imageIdByReference.set(asset.uri, asset.id);
    });

  return Object.fromEntries(
    Object.entries(scenesByStory).map(([storyId, scenes]) => {
      const assetIds = Object.values(scenes)
        .flatMap((scene) => scene.timeline)
        .filter((step) => step.blockType === 'background')
        .map((step) => (step.data as BackgroundBlockData).assetId)
        .flatMap((assetReference) => {
          const assetId = assetReference ? imageIdByReference.get(assetReference) : undefined;
          return assetId ? [assetId] : [];
        });
      return [storyId, uniqueAssetIds(assetIds)];
    }).filter(([, assetIds]) => assetIds.length > 0),
  );
}

/**
 * Keeps explicit image memberships and adds images already used as backgrounds
 * in existing scenes. Unreferenced global images remain hidden from every story.
 */
export function migrateStoryImageAssetIds(
  currentValue: unknown,
  scenesByStory: Record<string, Record<string, SceneRecord>>,
  mediaLibrary: LibraryAsset[],
  includeReferencedImages = true,
): StoryImageAssetIds {
  const current = normalizeStoryImageAssetIds(currentValue);
  const referenced = includeReferencedImages
    ? referencedImageAssetIds(scenesByStory, mediaLibrary)
    : {};

  return Object.fromEntries(
    Array.from(new Set([...Object.keys(current), ...Object.keys(referenced)])).map((storyId) => [
      storyId,
      uniqueAssetIds([...(current[storyId] ?? []), ...(referenced[storyId] ?? [])]),
    ]),
  );
}
