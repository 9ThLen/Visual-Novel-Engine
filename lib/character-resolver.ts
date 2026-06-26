import type { Character } from '@/lib/character-types';

export type CharacterLibraries = Record<string, Character[] | { characters?: Character[] } | undefined>;

export function normalizeSpeakerNameForDisplay(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function normalizeSpeakerNameForLookup(name: string): string {
  return normalizeSpeakerNameForDisplay(name).toLocaleLowerCase();
}

export function getCharactersForStory(
  characterLibraries: CharacterLibraries,
  storyId: string
): Character[] {
  const library = characterLibraries[storyId];
  if (Array.isArray(library)) return library;
  if (library && Array.isArray(library.characters)) return library.characters;
  return [];
}

export function findCharacterCaseInsensitive(
  characterLibraries: CharacterLibraries,
  storyId: string,
  name: string
): Character | null {
  const lookupName = normalizeSpeakerNameForLookup(name);
  if (!lookupName) return null;

  return getCharactersForStory(characterLibraries, storyId).find(
    (character) => normalizeSpeakerNameForLookup(character.name) === lookupName
  ) ?? null;
}

export function resolveCharacterSpriteUri(
  characterId: string,
  spriteId: string | null | undefined,
  characterLibraries: CharacterLibraries,
  storyId: string
): string | null {
  const character = getCharactersForStory(characterLibraries, storyId).find(
    (item) => item.id === characterId
  );
  if (!character) return null;

  const candidateIds = [
    spriteId || undefined,
    character.authoring?.currentSpriteId,
    character.defaultSpriteId,
  ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

  for (const candidateId of candidateIds) {
    const sprite = character.sprites.find((item) => item.id === candidateId);
    if (sprite?.uri) return sprite.uri;
  }

  return null;
}
