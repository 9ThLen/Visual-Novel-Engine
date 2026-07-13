import { buildAssetUsageReport, buildAvailableAssets, collectAssetReferences, toSpriteUsageAssetId } from '@/lib/asset-usage';
import type { Character, CharacterSprite } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';

export interface GalleryUsage { enabled: number; disabled: number }
export interface GalleryImage { asset: LibraryAsset; usage: GalleryUsage }
export interface GallerySprite { sprite: CharacterSprite; usage: GalleryUsage }
export interface GalleryCharacterGroup { character: Character; sprites: GallerySprite[] }
export interface StoryGallery { backgrounds: GalleryImage[]; characters: GalleryCharacterGroup[] }

export function buildStoryGallery(
  imageAssets: LibraryAsset[],
  characters: Character[],
  scenes: SceneRecord[],
): StoryGallery {
  const report = buildAssetUsageReport(
    collectAssetReferences(scenes),
    buildAvailableAssets(imageAssets, [], characters),
  );
  const usageById = new Map(report.assets.map(({ asset, references }) => [asset.id, {
    enabled: references.filter((reference) => reference.enabled).length,
    disabled: references.filter((reference) => !reference.enabled).length,
  }]));
  const empty = () => ({ enabled: 0, disabled: 0 });
  return {
    backgrounds: imageAssets.map((asset) => ({ asset, usage: usageById.get(asset.id) ?? empty() })),
    characters: characters.map((character) => ({
      character,
      sprites: character.sprites.map((sprite) => ({
        sprite,
        usage: usageById.get(toSpriteUsageAssetId(character.id, sprite.id)) ?? empty(),
      })),
    })),
  };
}
