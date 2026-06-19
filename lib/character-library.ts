/**
 * Character Library Manager
 * Manages per-story character libraries.
 *
 * NOTE: This file contains only pure functions. Store access should be
 * done via stores/use-app-store.ts. Functions accept characterLibraries
 * as parameter to avoid store import.
 */

import type { Character, CharacterSprite, CharacterLibrary } from './character-types';
import { generateId } from './id-utils';

// ── Internal helpers (pure) ──

function getLibraryFromState(
  storyId: string,
  characterLibraries: Record<string, Character[]>,
): Character[] {
  return characterLibraries[storyId] || [];
}

function saveLibraryToState(
  storyId: string,
  characters: Character[],
  characterLibraries: Record<string, Character[]>,
): Record<string, Character[]> {
  return { ...characterLibraries, [storyId]: characters };
}

// ── Public API (pure functions) ──

export function getCharacterLibrary(
  storyId: string,
  characterLibraries: Record<string, Character[]>,
): Character[] {
  return getLibraryFromState(storyId, characterLibraries);
}

export function saveCharacterLibrary(
  storyId: string,
  characters: Character[],
  characterLibraries: Record<string, Character[]>,
): Record<string, Character[]> {
  return saveLibraryToState(storyId, characters, characterLibraries);
}

export function addCharacter(
  storyId: string,
  character: Omit<Character, 'id' | 'createdAt'>,
  characterLibraries: Record<string, Character[]>,
): { character: Character; libraries: Record<string, Character[]> } {
  const library = getLibraryFromState(storyId, characterLibraries);
  const newCharacter: Character = {
    ...character,
    id: generateId('char', 11),
    createdAt: Date.now(),
  };
  const updated = [...library, newCharacter];
  return { character: newCharacter, libraries: saveLibraryToState(storyId, updated, characterLibraries) };
}

export function updateCharacter(
  storyId: string,
  characterId: string,
  updates: Partial<Omit<Character, 'id' | 'createdAt'>>,
  characterLibraries: Record<string, Character[]>,
): Record<string, Character[]> {
  const library = getLibraryFromState(storyId, characterLibraries);
  const index = library.findIndex((c) => c.id === characterId);
  if (index === -1) throw new Error('Character not found');
  const updated = library.map((c, i) => i === index ? { ...c, ...updates } : c);
  return saveLibraryToState(storyId, updated, characterLibraries);
}

export function deleteCharacter(
  storyId: string,
  characterId: string,
  characterLibraries: Record<string, Character[]>,
): Record<string, Character[]> {
  const library = getLibraryFromState(storyId, characterLibraries);
  const filtered = library.filter((c) => c.id !== characterId);
  return saveLibraryToState(storyId, filtered, characterLibraries);
}

export function addSpriteToCharacter(
  storyId: string,
  characterId: string,
  sprite: Omit<CharacterSprite, 'id' | 'createdAt'>,
  characterLibraries: Record<string, Character[]>,
): { sprite: CharacterSprite; libraries: Record<string, Character[]> } {
  const library = getLibraryFromState(storyId, characterLibraries);
  const charIndex = library.findIndex((c) => c.id === characterId);
  if (charIndex === -1) throw new Error('Character not found');

  const character = library[charIndex];
  const newSprite: CharacterSprite = {
    ...sprite,
    id: generateId('sprite', 11),
    createdAt: Date.now(),
  };
  const updatedSprites = [...character.sprites, newSprite];
  const updatedChar = {
    ...character,
    sprites: updatedSprites,
    defaultSpriteId: character.defaultSpriteId ?? (updatedSprites.length === 1 ? newSprite.id : undefined),
  };
  const updatedLibrary = library.map((c, i) => i === charIndex ? updatedChar : c);
  return { sprite: newSprite, libraries: saveLibraryToState(storyId, updatedLibrary, characterLibraries) };
}

export function updateSprite(
  storyId: string,
  characterId: string,
  spriteId: string,
  updates: Partial<Omit<CharacterSprite, 'id' | 'createdAt'>>,
  characterLibraries: Record<string, Character[]>,
): Record<string, Character[]> {
  const library = getLibraryFromState(storyId, characterLibraries);
  const charIndex = library.findIndex((c) => c.id === characterId);
  if (charIndex === -1) throw new Error('Character not found');

  const character = library[charIndex];
  const spriteIndex = character.sprites.findIndex((s) => s.id === spriteId);
  if (spriteIndex === -1) throw new Error('Sprite not found');

  const updatedSprites = character.sprites.map((s, i) =>
    i === spriteIndex ? { ...s, ...updates } : s,
  );
  const updatedChar = { ...character, sprites: updatedSprites };
  const updated = library.map((c, i) => i === charIndex ? updatedChar : c);
  return saveLibraryToState(storyId, updated, characterLibraries);
}

export function deleteSprite(
  storyId: string,
  characterId: string,
  spriteId: string,
  characterLibraries: Record<string, Character[]>,
): Record<string, Character[]> {
  const library = getLibraryFromState(storyId, characterLibraries);
  const charIndex = library.findIndex((c) => c.id === characterId);
  if (charIndex === -1) throw new Error('Character not found');

  const character = library[charIndex];
  const updatedSprites = character.sprites.filter((s) => s.id !== spriteId);
  const updatedDefaultId = character.defaultSpriteId === spriteId
    ? updatedSprites[0]?.id
    : character.defaultSpriteId;
  const updatedChar = { ...character, sprites: updatedSprites, defaultSpriteId: updatedDefaultId };
  const updated = library.map((c, i) => i === charIndex ? updatedChar : c);
  return saveLibraryToState(storyId, updated, characterLibraries);
}

export function searchCharacters(
  storyId: string,
  query: string,
  characterLibraries: Record<string, Character[]>,
): Character[] {
  const library = getLibraryFromState(storyId, characterLibraries);
  const lowerQuery = query.toLowerCase();
  return library.filter((char) => char.name.toLowerCase().includes(lowerQuery));
}

export function searchSprites(
  storyId: string,
  characterId: string,
  query: string,
  characterLibraries: Record<string, Character[]>,
): CharacterSprite[] {
  const library = getLibraryFromState(storyId, characterLibraries);
  const character = library.find((c) => c.id === characterId);
  if (!character) return [];
  const lowerQuery = query.toLowerCase();
  return character.sprites.filter(
    (sprite) =>
      sprite.name.toLowerCase().includes(lowerQuery) ||
      sprite.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery)),
  );
}

export function getSpritesByTag(
  storyId: string,
  characterId: string,
  tag: string,
  characterLibraries: Record<string, Character[]>,
): CharacterSprite[] {
  const library = getLibraryFromState(storyId, characterLibraries);
  const character = library.find((c) => c.id === characterId);
  if (!character) return [];
  return character.sprites.filter((sprite) =>
    sprite.tags?.some((t) => t.toLowerCase() === tag.toLowerCase()),
  );
}

export function importCharacterLibrary(
  targetStoryId: string,
  sourceStoryId: string,
  characterLibraries: Record<string, Character[]>,
): Record<string, Character[]> {
  const sourceLibrary = getLibraryFromState(sourceStoryId, characterLibraries);
  const targetLibrary = getLibraryFromState(targetStoryId, characterLibraries);
  const spriteIdMap = new Map<string, string>();

  const importedCharacters = sourceLibrary.map((char) => {
    const newCharId = generateId('char', 11);
    const newSprites = char.sprites.map((sprite) => {
      const newSpriteId = generateId('sprite', 11);
      spriteIdMap.set(sprite.id, newSpriteId);
      return { ...sprite, id: newSpriteId };
    });
    return {
      ...char,
      id: newCharId,
      sprites: newSprites,
      defaultSpriteId: char.defaultSpriteId ? spriteIdMap.get(char.defaultSpriteId) ?? char.defaultSpriteId : undefined,
    };
  });

  return saveLibraryToState(targetStoryId, [...targetLibrary, ...importedCharacters], characterLibraries);
}

export function exportCharacterLibrary(
  storyId: string,
  characterLibraries: Record<string, Character[]>,
): string {
  const library = getLibraryFromState(storyId, characterLibraries);
  return JSON.stringify({ characters: library }, null, 2);
}

export function importCharacterLibraryFromJSON(
  storyId: string,
  json: string,
  characterLibraries: Record<string, Character[]>,
): Record<string, Character[]> {
  const parsed: CharacterLibrary = JSON.parse(json);
  const targetLibrary = getLibraryFromState(storyId, characterLibraries);
  const spriteIdMap = new Map<string, string>();

  const importedCharacters = parsed.characters.map((char) => {
    const newCharId = generateId('char', 11);
    const newSprites = char.sprites.map((sprite) => {
      const newSpriteId = generateId('sprite', 11);
      spriteIdMap.set(sprite.id, newSpriteId);
      return { ...sprite, id: newSpriteId };
    });
    return { ...char, id: newCharId, sprites: newSprites };
  });

  return saveLibraryToState(storyId, [...targetLibrary, ...importedCharacters], characterLibraries);
}

export function getCharacter(
  storyId: string,
  characterId: string,
  characterLibraries: Record<string, Character[]>,
): Character | undefined {
  const library = getLibraryFromState(storyId, characterLibraries);
  return library.find((c) => c.id === characterId);
}

export function getSprite(
  storyId: string,
  characterId: string,
  spriteId: string,
  characterLibraries: Record<string, Character[]>,
): CharacterSprite | undefined {
  const character = getCharacter(storyId, characterId, characterLibraries);
  return character?.sprites.find((s) => s.id === spriteId);
}
