/**
 * Images that would leave the story with the sprite that held them.
 *
 * A sprite's picture does not have to be in the media library. One imported
 * through a character — or generated for it — lives as a bare URI on the
 * sprite, and the media library shows it only because the sprite points at it.
 * Delete the character and the picture is not deleted, it simply stops being
 * reachable: no screen lists it, and the file sits in storage until the media
 * collector decides nobody wants it.
 *
 * Deleting a character is deleting a character, not discarding the artwork
 * bought for it. So when a sprite disappears, whatever it pointed at is kept as
 * an ordinary image of the story.
 *
 * The reverse mistake is cheap: an image kept that the author no longer wants
 * is one they can remove from the media library, while an image dropped is gone
 * from every screen that could offer it back.
 */

import type { Character, CharacterSprite } from '@/lib/character-types';
import { generateAssetId } from '@/lib/id-utils';
import type { LibraryAsset } from '@/lib/media-library-service';
import { addImageAssetToStory, type StoryImageAssetIds } from '@/lib/story-image-library';

export interface OrphanedSpriteImageInput {
  storyId: string;
  /** The character library as it was before this write. */
  previous: Character[];
  /** The character library being written. */
  next: Character[];
  mediaLibrary: LibraryAsset[];
  imageAssetIdsByStory: StoryImageAssetIds;
  now: number;
  /** Test seam for a predictable id. */
  createAssetId?: () => string;
}

export interface OrphanedSpriteImageResult {
  mediaLibrary: LibraryAsset[];
  imageAssetIdsByStory: StoryImageAssetIds;
}

/** The URI that survives a reload; `uri` may hold a runtime blob in the editor. */
function canonicalUri(sprite: CharacterSprite): string {
  return sprite.assetUri ?? sprite.uri;
}

/**
 * What a sprite points at, named the same way every time.
 *
 * One file has up to four spellings on a sprite — `assetUri` or `uri`, each
 * holding either a library asset's id or its URI — and the media library
 * resolves all four to one asset. Comparing raw URIs instead would read a
 * sprite rewritten from one spelling to another as a file that vanished, and
 * "rescue" a duplicate of an image nothing lost.
 *
 * The order matches `findSpriteAsset` in story-media-gallery: the two views of
 * the same data disagreeing about which asset a sprite means is its own bug.
 */
function spriteIdentity(
  sprite: CharacterSprite,
  assetById: Map<string, LibraryAsset>,
  assetByUri: Map<string, LibraryAsset>,
): string {
  const { assetUri, uri } = sprite;
  const asset = (assetUri ? assetById.get(assetUri) ?? assetByUri.get(assetUri) : undefined)
    ?? assetById.get(uri)
    ?? assetByUri.get(uri);
  return asset ? asset.id : canonicalUri(sprite);
}

function spritesByIdentity(
  characters: Character[],
  assetById: Map<string, LibraryAsset>,
  assetByUri: Map<string, LibraryAsset>,
): Map<string, CharacterSprite> {
  const sprites = new Map<string, CharacterSprite>();
  for (const character of characters) {
    for (const sprite of character.sprites) {
      sprites.set(spriteIdentity(sprite, assetById, assetByUri), sprite);
    }
  }
  return sprites;
}

/**
 * A runtime `blob:` URI is the editor's temporary handle on an image, not a
 * place the image can be found later. Materializing one would produce a library
 * entry that is broken the moment the page reloads.
 */
function isPersistentUri(uri: string): boolean {
  return !!uri && !uri.startsWith('blob:');
}

/** Strip a file extension for a name to show in the library. */
function imageName(sprite: CharacterSprite): string {
  const fromUri = canonicalUri(sprite).split(/[\\/]/).pop() ?? '';
  return sprite.name.trim() || fromUri.replace(/\.[a-z0-9]{1,5}$/i, '') || 'Image';
}

/**
 * Keep the pictures of sprites that this write removes.
 *
 * Returns null when there is nothing to do, so a caller can leave its state
 * object untouched — which is most writes, since most do not remove a sprite.
 */
export function keepOrphanedSpriteImages(
  input: OrphanedSpriteImageInput,
): OrphanedSpriteImageResult | null {
  const { storyId, previous, next, mediaLibrary, imageAssetIdsByStory, now } = input;
  if (!storyId || !previous.length) return null;

  const assetById = new Map(mediaLibrary.map((asset) => [asset.id, asset]));
  const assetByUri = new Map(mediaLibrary.map((asset) => [asset.uri, asset]));

  const survivors = spritesByIdentity(next, assetById, assetByUri);
  const removed = [...spritesByIdentity(previous, assetById, assetByUri).entries()]
    .filter(([identity, sprite]) =>
      !survivors.has(identity) && (assetById.has(identity) || isPersistentUri(identity)));
  if (!removed.length) return null;

  let nextMediaLibrary = mediaLibrary;
  let nextImageAssetIds = imageAssetIdsByStory;
  let changed = false;

  for (const [identity, sprite] of removed) {
    // The picture may already be a library asset — a sprite made from an
    // imported image, or by the media library's own "add to character". Then
    // there is nothing to create, only membership to make sure of.
    const existing = assetById.get(identity);
    const assetId = existing?.id ?? (input.createAssetId?.() ?? generateAssetId());

    if (!existing) {
      nextMediaLibrary = [...nextMediaLibrary, {
        id: assetId,
        type: 'image',
        uri: identity,
        name: imageName(sprite),
        addedAt: now,
      }];
      changed = true;
    }

    const withMembership = addImageAssetToStory(nextImageAssetIds, storyId, assetId);
    if (withMembership !== nextImageAssetIds) {
      nextImageAssetIds = withMembership;
      changed = true;
    }
  }

  return changed
    ? { mediaLibrary: nextMediaLibrary, imageAssetIdsByStory: nextImageAssetIds }
    : null;
}
