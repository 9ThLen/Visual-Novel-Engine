import type { Character, CharacterSprite, CharacterLibrary } from './character-types';
import { useAppStore } from '../stores/use-app-store';
import { generateId } from './id-utils';

function getLibrary(storyId: string): Character[] {
  return useAppStore.getState().characterLibraries[storyId] || [];
}

function saveLibrary(storyId: string, characters: Character[]): void {
  useAppStore.getState().setCharacterLibrary(storyId, characters);
}

export function getCharacterLibrary(storyId: string): Character[] {
  return getLibrary(storyId);
}

export function saveCharacterLibrary(
  storyId: string,
  characters: Character[]
): void {
  saveLibrary(storyId, characters);
}

export function addCharacter(
  storyId: string,
  character: Omit<Character, 'id' | 'createdAt'>
): Character {
  const library = getLibrary(storyId);
  const newCharacter: Character = {
    ...character,
    id: generateId('char', 11),
    createdAt: Date.now(),
  };
  saveLibrary(storyId, [...library, newCharacter]);
  return newCharacter;
}

export function updateCharacter(
  storyId: string,
  characterId: string,
  updates: Partial<Omit<Character, 'id' | 'createdAt'>>
): void {
  const library = getLibrary(storyId);
  const index = library.findIndex((c) => c.id === characterId);
  if (index === -1) throw new Error('Character not found');
  const updated = library.map((c, i) => i === index ? { ...c, ...updates } : c);
  saveLibrary(storyId, updated);
}

export function deleteCharacter(storyId: string, characterId: string): void {
  const library = getLibrary(storyId);
  const filtered = library.filter((c) => c.id !== characterId);
  saveLibrary(storyId, filtered);
}

export function addSpriteToCharacter(
  storyId: string,
  characterId: string,
  sprite: Omit<CharacterSprite, 'id' | 'createdAt'>
): CharacterSprite {
  const library = getLibrary(storyId);
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
  saveLibrary(storyId, updatedLibrary);
  return newSprite;
}

export function updateSprite(
  storyId: string,
  characterId: string,
  spriteId: string,
  updates: Partial<Omit<CharacterSprite, 'id' | 'createdAt'>>
): void {
  const library = getLibrary(storyId);
  const charIndex = library.findIndex((c) => c.id === characterId);
  if (charIndex === -1) throw new Error('Character not found');

  const character = library[charIndex];
  const spriteIndex = character.sprites.findIndex((s) => s.id === spriteId);
  if (spriteIndex === -1) throw new Error('Sprite not found');

  const updatedSprites = character.sprites.map((s, i) =>
    i === spriteIndex ? { ...s, ...updates } : s
  );
  const updatedChar = { ...character, sprites: updatedSprites };
  const updated = library.map((c, i) => i === charIndex ? updatedChar : c);
  saveLibrary(storyId, updated);
}

export function deleteSprite(
  storyId: string,
  characterId: string,
  spriteId: string
): void {
  const library = getLibrary(storyId);
  const charIndex = library.findIndex((c) => c.id === characterId);
  if (charIndex === -1) throw new Error('Character not found');

  const character = library[charIndex];
  const updatedSprites = character.sprites.filter((s) => s.id !== spriteId);
  const updatedDefaultId = character.defaultSpriteId === spriteId
    ? updatedSprites[0]?.id
    : character.defaultSpriteId;

  const updatedChar = { ...character, sprites: updatedSprites, defaultSpriteId: updatedDefaultId };
  const updated = library.map((c, i) => i === charIndex ? updatedChar : c);
  saveLibrary(storyId, updated);
}

export function searchCharacters(
  storyId: string,
  query: string
): Character[] {
  const library = getLibrary(storyId);
  const lowerQuery = query.toLowerCase();
  return library.filter((char) => char.name.toLowerCase().includes(lowerQuery));
}

export function searchSprites(
  storyId: string,
  characterId: string,
  query: string
): CharacterSprite[] {
  const library = getLibrary(storyId);
  const character = library.find((c) => c.id === characterId);
  if (!character) return [];

  const lowerQuery = query.toLowerCase();
  return character.sprites.filter(
    (sprite) =>
      sprite.name.toLowerCase().includes(lowerQuery) ||
      sprite.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

export function getSpritesByTag(
  storyId: string,
  characterId: string,
  tag: string
): CharacterSprite[] {
  const library = getLibrary(storyId);
  const character = library.find((c) => c.id === characterId);
  if (!character) return [];

  return character.sprites.filter((sprite) =>
    sprite.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
  );
}

export function importCharacterLibrary(
  targetStoryId: string,
  sourceStoryId: string
): void {
  const sourceLibrary = getLibrary(sourceStoryId);
  const targetLibrary = getLibrary(targetStoryId);

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

  saveLibrary(targetStoryId, [...targetLibrary, ...importedCharacters]);
}

export function exportCharacterLibrary(storyId: string): string {
  const library = getLibrary(storyId);
  return JSON.stringify({ characters: library }, null, 2);
}

export function importCharacterLibraryFromJSON(
  storyId: string,
  json: string
): void {
  const parsed: CharacterLibrary = JSON.parse(json);
  const targetLibrary = getLibrary(storyId);

  const spriteIdMap = new Map<string, string>();

  const importedCharacters = parsed.characters.map((char) => {
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
    };
  });

  saveLibrary(storyId, [...targetLibrary, ...importedCharacters]);
}

export function getCharacter(
  storyId: string,
  characterId: string
): Character | undefined {
  const library = getLibrary(storyId);
  return library.find((c) => c.id === characterId);
}

export function getSprite(
  storyId: string,
  characterId: string,
  spriteId: string
): CharacterSprite | undefined {
  const character = getCharacter(storyId, characterId);
  return character?.sprites.find((s) => s.id === spriteId);
}
