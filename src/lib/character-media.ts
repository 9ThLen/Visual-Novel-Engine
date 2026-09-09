/**
 * Character ownership of a media file, as the media library performs it.
 *
 * Ownership is **additive**: attaching a file to a character creates a new
 * sprite pointing at the same bytes, and nothing is ever moved. The timeline
 * refers to a sprite by the composite key `${characterId}:${spriteId}` (see
 * `toSpriteUsageAssetId`), so transferring a sprite between characters would
 * dangle every reference to it while a copy dangles none.
 *
 * Detaching is the mirror image and is only offered when nothing references the
 * sprite, which is why this module has no reference-rewriting of its own.
 */

import type { Character, CharacterSprite } from '@/lib/character-types';
import { generateId } from '@/lib/id-utils';

export interface AttachSpriteInput {
  characters: Character[];
  characterId: string;
  /**
   * Persistent reference to the file: the library asset id when the file has
   * one, else its URI. Both forms resolve — a bare id is an asset reference
   * everywhere in the app (see `resolveLibraryAssetUri`) — and the id is the
   * stabler of the two, so the caller should prefer it.
   */
  ref: string;
  /** Proposed sprite name; deduplicated against the character's existing ones. */
  name: string;
  now: number;
  /** Test seam so a fixed id can be asserted on. */
  createId?: () => string;
}

/**
 * The library never writes `assetUri`.
 *
 * That field exists for the web editor, which parks a runtime `blob:` in `uri`
 * and keeps the persistent value in `assetUri`; on the way out of the iframe
 * `restorePersistentCharacterUris` collapses the pair again. A sprite created
 * here has one URI that is already persistent, and writing both fields would
 * hand the merge a pair it has to reconcile for no reason.
 */
function canonicalUri(sprite: CharacterSprite): string {
  return sprite.assetUri ?? sprite.uri;
}

/**
 * Sprite names are unique per character, case-insensitively — the AI change-set
 * validator rejects a duplicate outright (lib/ai/change-set.ts), so a library
 * that created one would produce a story the assistant then refuses to edit.
 */
function uniqueSpriteName(character: Character, proposed: string): string {
  const base = proposed.trim() || 'Sprite';
  const taken = new Set(character.sprites.map((sprite) => sprite.name.trim().toLocaleLowerCase()));
  if (!taken.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

/**
 * Give `characterId` its own sprite for the file at `ref`.
 *
 * Returns the input array unchanged when there is nothing to do — an unknown
 * character, or a sprite for that exact reference already there. The second
 * case is the double-tap guard: the picker hides characters that already own
 * the file, but the press can land twice before the store round-trips.
 */
export function attachSpriteToCharacter(input: AttachSpriteInput): Character[] {
  const { characters, characterId, ref, name, now, createId } = input;
  const index = characters.findIndex((character) => character.id === characterId);
  if (index < 0 || !ref) return characters;

  const character = characters[index];
  if (character.sprites.some((sprite) => canonicalUri(sprite) === ref || sprite.uri === ref)) {
    return characters;
  }

  const sprite: CharacterSprite = {
    id: createId ? createId() : generateId('sprite'),
    name: uniqueSpriteName(character, name),
    uri: ref,
    createdAt: now,
  };

  const next = [...characters];
  next[index] = {
    ...character,
    sprites: [...character.sprites, sprite],
    // A character whose first sprite this is has nothing to fall back to, and
    // the AI path sets the default the same way when it adds one.
    ...(character.defaultSpriteId ? {} : { defaultSpriteId: sprite.id }),
  };
  return next;
}

/**
 * Take one sprite off a character.
 *
 * Both pointers into the sprite list are repaired here, not just the one the
 * editor happens to repair: `authoring.currentSpriteId` decides what the
 * speaker token shows, `defaultSpriteId` decides what the library calls the
 * character's default, and leaving either pointing at a deleted sprite makes
 * the character look like it has no default at all.
 */
export function detachSpriteFromCharacter(
  characters: Character[],
  characterId: string,
  spriteId: string,
): Character[] {
  const index = characters.findIndex((character) => character.id === characterId);
  if (index < 0) return characters;

  const character = characters[index];
  const sprites = character.sprites.filter((sprite) => sprite.id !== spriteId);
  if (sprites.length === character.sprites.length) return characters;

  const fallbackSpriteId = sprites[0]?.id;
  const next = [...characters];
  const detached: Character = { ...character, sprites };

  if (character.defaultSpriteId === spriteId) {
    if (fallbackSpriteId) detached.defaultSpriteId = fallbackSpriteId;
    else delete detached.defaultSpriteId;
  }

  if (character.authoring?.currentSpriteId === spriteId) {
    detached.authoring = { ...character.authoring, currentSpriteId: fallbackSpriteId };
  }

  next[index] = detached;
  return next;
}

/** The file name without its extension — the sprite name the author starts from. */
export function spriteNameFromFileName(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || fileName;
}

/**
 * Make one of a character's sprites its default.
 *
 * Purely a fallback pointer: every reference in a timeline names its sprite
 * outright, and `defaultSpriteId` only decides what is shown when none was
 * named. Nothing can dangle here, which is why this action is offered without
 * the usage checks that guard detaching.
 *
 * `authoring.currentSpriteId` is deliberately left alone — that one is the
 * editor's current selection for the next block it inserts, and moving it would
 * change what the author's next keystroke produces.
 */
export function setDefaultSprite(
  characters: Character[],
  characterId: string,
  spriteId: string,
): Character[] {
  const index = characters.findIndex((character) => character.id === characterId);
  if (index < 0) return characters;

  const character = characters[index];
  if (character.defaultSpriteId === spriteId) return characters;
  if (!character.sprites.some((sprite) => sprite.id === spriteId)) return characters;

  const next = [...characters];
  next[index] = { ...character, defaultSpriteId: spriteId };
  return next;
}
