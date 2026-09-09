/**
 * Three-way merge for the character library.
 *
 * The document editor keeps its own copy of the characters while the author is
 * typing and writes that copy back wholesale on save. Anything that mutates
 * `characterLibraries` from outside the editor — an AI rollback, the media
 * library — is therefore overwritten by the next editor save unless the
 * external change is merged in first.
 *
 * A two-way merge cannot do this: with "local wins" an externally deleted
 * sprite comes back, and with "incoming wins" the author's unsaved work is
 * lost. The base — the last external value the editor observed — is what tells
 * "the author edited this" apart from "somebody else edited this".
 *
 * Deletions are the subtle half. Presence on one side only is ambiguous without
 * the base: absent from `incoming` means either an external delete or a local
 * add, and absent from `local` means either a local delete or an external add.
 * Only the base separates them, and it is consulted in both directions.
 */

import { stableStringify } from '@/lib/ai/scene-revision';
import type { Character, CharacterSprite } from '@/lib/character-types';

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function same(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * `assetUri` holds the persistent URI while `uri` may carry a runtime `blob:`
 * inside the web editor, so the two are one logical value. A difference that
 * reduces to that pair is not an author edit.
 */
function canonicalUri(sprite: CharacterSprite): string {
  return sprite.assetUri ?? sprite.uri;
}

/**
 * The author's edit wins any conflict: their work is unsaved and unrecoverable,
 * while the external side is already persisted.
 */
function pick<T>(base: T, local: T, incoming: T): T {
  return same(local, base) ? incoming : local;
}

function spriteFingerprint(sprite: CharacterSprite): string {
  const { assetUri: _assetUri, uri: _uri, ...rest } = sprite;
  return stableStringify({ ...rest, canonicalUri: canonicalUri(sprite) });
}

function characterFingerprint(character: Character): string {
  const { sprites, ...rest } = character;
  return stableStringify({ ...rest, sprites: sprites.map(spriteFingerprint) });
}

function mergeSprite(
  base: CharacterSprite,
  local: CharacterSprite,
  incoming: CharacterSprite,
): CharacterSprite {
  const merged: CharacterSprite = {
    ...local,
    name: pick(base.name, local.name, incoming.name),
    tags: pick(base.tags, local.tags, incoming.tags),
    position: pick(base.position, local.position, incoming.position),
    scale: pick(base.scale, local.scale, incoming.scale),
    expression: pick(base.expression, local.expression, incoming.expression),
    createdAt: pick(base.createdAt, local.createdAt, incoming.createdAt),
  };

  // The URI pair moves together or not at all — merging the two fields
  // independently could pair a local `uri` with an incoming `assetUri` and
  // point the sprite at a file neither side chose.
  if (canonicalUri(local) === canonicalUri(base)) {
    merged.uri = incoming.uri;
    if (incoming.assetUri === undefined) delete merged.assetUri;
    else merged.assetUri = incoming.assetUri;
  }

  return merged;
}

function mergeSprites(
  base: CharacterSprite[],
  local: CharacterSprite[],
  incoming: CharacterSprite[],
): CharacterSprite[] {
  const baseById = byId(base);
  const localById = byId(local);
  const incomingById = byId(incoming);
  const merged: CharacterSprite[] = [];

  // Incoming order first, so an external add is visible where the writer put it.
  for (const sprite of incoming) {
    const localSprite = localById.get(sprite.id);
    if (!localSprite) {
      // Missing locally. If it was never in the base it is an external add and
      // we take it; if it WAS in the base the author deleted it, and a local
      // delete wins for the same reason a local edit does.
      if (!baseById.has(sprite.id)) merged.push(sprite);
      continue;
    }
    const baseSprite = baseById.get(sprite.id);
    merged.push(baseSprite ? mergeSprite(baseSprite, localSprite, sprite) : localSprite);
  }

  for (const sprite of local) {
    if (incomingById.has(sprite.id)) continue;
    const baseSprite = baseById.get(sprite.id);
    // Never in the base: the author created it locally, so it is not a deletion.
    if (!baseSprite) {
      merged.push(sprite);
      continue;
    }
    // In the base and gone from incoming: an external delete. Honour it only
    // while the author has not touched the sprite themselves.
    if (spriteFingerprint(baseSprite) === spriteFingerprint(sprite)) continue;
    merged.push(sprite);
  }

  return merged;
}

function mergeCharacter(base: Character, local: Character, incoming: Character): Character {
  return {
    ...local,
    name: pick(base.name, local.name, incoming.name),
    color: pick(base.color, local.color, incoming.color),
    defaultSpriteId: pick(base.defaultSpriteId, local.defaultSpriteId, incoming.defaultSpriteId),
    authoring: pick(base.authoring, local.authoring, incoming.authoring),
    characterAuthoringSchemaVersion: pick(
      base.characterAuthoringSchemaVersion,
      local.characterAuthoringSchemaVersion,
      incoming.characterAuthoringSchemaVersion,
    ),
    createdAt: pick(base.createdAt, local.createdAt, incoming.createdAt),
    sprites: mergeSprites(base.sprites, local.sprites, incoming.sprites),
  };
}

/**
 * Merge an external character-library write into the editor's working copy.
 *
 * @param base     the last external value the editor observed
 * @param local    the editor's current (possibly unsaved) copy
 * @param incoming the new external value
 */
export function mergeExternalCharacters(
  base: Character[],
  local: Character[],
  incoming: Character[],
): Character[] {
  const baseById = byId(base);
  const localById = byId(local);
  const incomingById = byId(incoming);
  const merged: Character[] = [];

  for (const character of incoming) {
    const localCharacter = localById.get(character.id);
    if (!localCharacter) {
      // Same rule as sprites: adopt an external add, honour a local delete.
      if (!baseById.has(character.id)) merged.push(character);
      continue;
    }
    const baseCharacter = baseById.get(character.id);
    merged.push(
      baseCharacter ? mergeCharacter(baseCharacter, localCharacter, character) : localCharacter,
    );
  }

  for (const character of local) {
    if (incomingById.has(character.id)) continue;
    const baseCharacter = baseById.get(character.id);
    if (!baseCharacter) {
      merged.push(character);
      continue;
    }
    if (characterFingerprint(baseCharacter) === characterFingerprint(character)) continue;
    merged.push(character);
  }

  return merged;
}

/**
 * Whether two libraries are the same for merge purposes — the URI pair aside,
 * so the caller can skip a state update that would only re-render.
 */
export function charactersEquivalent(a: Character[], b: Character[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((character, index) => characterFingerprint(character) === characterFingerprint(b[index]));
}
