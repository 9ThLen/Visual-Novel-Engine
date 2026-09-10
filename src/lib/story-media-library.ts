import { collectAssetReferences } from '@/lib/asset-usage';
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { StoryMetadata } from '@/lib/story-domain';
import type { StoryImageAssetIds } from '@/lib/story-image-library';

export type StoryMediaAssetIds = Record<string, string[]>;

function uniqueAssetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  )));
}

export function normalizeStoryMediaAssetIds(value: unknown): StoryMediaAssetIds {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([storyId]) => storyId.trim().length > 0)
      .map(([storyId, assetIds]) => [storyId, uniqueAssetIds(assetIds)]),
  );
}

export function addMediaAssetToStory(
  current: StoryMediaAssetIds,
  storyId: string,
  assetId: string,
): StoryMediaAssetIds {
  if (!storyId || !assetId) return current;
  const ids = uniqueAssetIds(current[storyId]);
  if (ids.includes(assetId)) return current;
  return { ...current, [storyId]: [...ids, assetId] };
}

export function removeMediaAssetFromStory(
  current: StoryMediaAssetIds,
  storyId: string,
  assetId: string,
): StoryMediaAssetIds {
  const ids = uniqueAssetIds(current[storyId]);
  if (!ids.includes(assetId)) return current;
  return { ...current, [storyId]: ids.filter((id) => id !== assetId) };
}

function collectResolvedAssetIds(
  references: Iterable<string | null | undefined>,
  mediaLibrary: LibraryAsset[],
): string[] {
  const byReference = new Map<string, string>();
  mediaLibrary.forEach((asset) => {
    byReference.set(asset.id, asset.id);
    byReference.set(asset.uri, asset.id);
  });
  return uniqueAssetIds(Array.from(references).flatMap((reference) => {
    const assetId = reference ? byReference.get(reference) : undefined;
    return assetId ? [assetId] : [];
  }));
}

export interface StoryMediaMigrationInput {
  current: unknown;
  imageAssetIdsByStory: StoryImageAssetIds;
  stories: StoryMetadata[];
  scenesByStory: Record<string, Record<string, SceneRecord>>;
  characterLibraries: Record<string, Character[]>;
  audioLibraries: Record<string, AudioLibraryItem[]>;
  mediaLibrary: LibraryAsset[];
}

export function migrateStoryMediaAssetIds(input: StoryMediaMigrationInput): StoryMediaAssetIds {
  const current = normalizeStoryMediaAssetIds(input.current);
  const storyIds = new Set([
    ...Object.keys(current),
    ...Object.keys(input.imageAssetIdsByStory),
    ...input.stories.map((story) => story.id),
  ]);

  return Object.fromEntries(Array.from(storyIds).map((storyId) => {
    const scenes = Object.values(input.scenesByStory[storyId] ?? {});
    const timelineReferences = collectAssetReferences(scenes).map((reference) => reference.assetId);
    const rawSceneReferences = scenes.flatMap((scene) => [
      scene.voiceAudioUri,
      ...scene.timeline.flatMap((step) => {
        if (step.blockType !== 'interactive_object') return [];
        const data = step.data as {
          actions?: { type?: string; audioUri?: string; imageUri?: string }[];
        };
        return (data.actions ?? []).flatMap((action) => [action.audioUri, action.imageUri]);
      }),
    ]);
    const spriteReferences = (input.characterLibraries[storyId] ?? [])
      .flatMap((character) => character.sprites.flatMap((sprite) => [sprite.assetUri, sprite.uri]));
    const audioReferences = (input.audioLibraries[storyId] ?? [])
      .flatMap((item) => [item.id, item.uri]);
    const coverReference = input.stories.find((story) => story.id === storyId)?.thumbnailUri;
    const resolved = collectResolvedAssetIds([
      ...timelineReferences,
      ...rawSceneReferences,
      ...spriteReferences,
      ...audioReferences,
      coverReference,
    ], input.mediaLibrary);

    return [storyId, uniqueAssetIds([
      ...(current[storyId] ?? []),
      ...(input.imageAssetIdsByStory[storyId] ?? []),
      ...resolved,
    ])];
  }));
}
