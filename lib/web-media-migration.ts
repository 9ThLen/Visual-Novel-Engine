import type { Character } from '@/lib/character-types';
import {
  persistWebDataUri,
  type LibraryAsset,
} from '@/lib/media-library-service';

export type WebMediaMigrationResult = {
  characterLibraries: Record<string, Character[]>;
  mediaLibrary: LibraryAsset[];
  migratedCount: number;
};

/**
 * Move legacy inline media into IndexedDB while preserving asset/sprite IDs.
 * State is returned only after every referenced Blob has been written.
 */
export async function migrateWebMediaReferences(
  mediaLibrary: LibraryAsset[],
  characterLibraries: Record<string, Character[]>,
): Promise<WebMediaMigrationResult> {
  let migratedCount = 0;
  const migratedMediaLibrary: LibraryAsset[] = [];

  for (const asset of mediaLibrary) {
    if (!asset.uri.startsWith('data:')) {
      migratedMediaLibrary.push(asset);
      continue;
    }
    const uri = await persistWebDataUri(asset.uri, asset.type);
    migratedMediaLibrary.push({ ...asset, uri });
    migratedCount += 1;
  }

  const migratedCharacterLibraries: Record<string, Character[]> = {};
  for (const [storyId, characters] of Object.entries(characterLibraries)) {
    const migratedCharacters: Character[] = [];
    for (const character of characters) {
      const migratedSprites = [];
      for (const sprite of character.sprites) {
        if (!sprite.uri.startsWith('data:')) {
          migratedSprites.push(sprite);
          continue;
        }
        const uri = await persistWebDataUri(sprite.uri, 'image');
        migratedSprites.push({ ...sprite, uri });
        migratedCount += 1;
      }
      migratedCharacters.push(
        migratedSprites.some((sprite, index) => sprite !== character.sprites[index])
          ? { ...character, sprites: migratedSprites }
          : character,
      );
    }
    migratedCharacterLibraries[storyId] = migratedCharacters;
  }

  return {
    characterLibraries: migratedCharacterLibraries,
    mediaLibrary: migratedMediaLibrary,
    migratedCount,
  };
}
