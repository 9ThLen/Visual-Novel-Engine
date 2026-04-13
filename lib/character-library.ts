/**
 * Character Library Management
 * CRUD operations for character library (per-story)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Character, CharacterSprite, CharacterLibrary } from './character-types';

const STORAGE_PREFIX = 'character_library_';

// ── Get Library ───────────────────────────────────────────────────────────

export async function getCharacterLibrary(storyId: string): Promise<Character[]> {
  try {
    const key = `${STORAGE_PREFIX}${storyId}`;
    const json = await AsyncStorage.getItem(key);
    if (!json) return [];
    const library: CharacterLibrary = JSON.parse(json);
    return library.characters || [];
  } catch (error) {
    console.error('[CharacterLibrary] getCharacterLibrary failed:', error);
    return [];
  }
}

// ── Save Library ──────────────────────────────────────────────────────────

export async function saveCharacterLibrary(
  storyId: string,
  characters: Character[]
): Promise<void> {
  try {
    const key = `${STORAGE_PREFIX}${storyId}`;
    const library: CharacterLibrary = { characters };
    await AsyncStorage.setItem(key, JSON.stringify(library));
  } catch (error) {
    console.error('[CharacterLibrary] saveCharacterLibrary failed:', error);
    throw error;
  }
}

// ── Add Character ─────────────────────────────────────────────────────────

export async function addCharacter(
  storyId: string,
  character: Omit<Character, 'id' | 'createdAt'>
): Promise<Character> {
  const library = await getCharacterLibrary(storyId);
  const newCharacter: Character = {
    ...character,
    id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: Date.now(),
  };
  library.push(newCharacter);
  await saveCharacterLibrary(storyId, library);
  return newCharacter;
}

// ── Update Character ──────────────────────────────────────────────────────

export async function updateCharacter(
  storyId: string,
  characterId: string,
  updates: Partial<Omit<Character, 'id' | 'createdAt'>>
): Promise<void> {
  const library = await getCharacterLibrary(storyId);
  const index = library.findIndex((c) => c.id === characterId);
  if (index === -1) throw new Error('Character not found');
  library[index] = { ...library[index], ...updates };
  await saveCharacterLibrary(storyId, library);
}

// ── Delete Character ──────────────────────────────────────────────────────

export async function deleteCharacter(storyId: string, characterId: string): Promise<void> {
  const library = await getCharacterLibrary(storyId);
  const filtered = library.filter((c) => c.id !== characterId);
  await saveCharacterLibrary(storyId, filtered);
}

// ── Add Sprite to Character ───────────────────────────────────────────────

export async function addSpriteToCharacter(
  storyId: string,
  characterId: string,
  sprite: Omit<CharacterSprite, 'id' | 'createdAt'>
): Promise<CharacterSprite> {
  const library = await getCharacterLibrary(storyId);
  const character = library.find((c) => c.id === characterId);
  if (!character) throw new Error('Character not found');

  const newSprite: CharacterSprite = {
    ...sprite,
    id: `sprite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: Date.now(),
  };

  character.sprites.push(newSprite);

  // Set as default if it's the first sprite
  if (character.sprites.length === 1) {
    character.defaultSpriteId = newSprite.id;
  }

  await saveCharacterLibrary(storyId, library);
  return newSprite;
}

// ── Update Sprite ─────────────────────────────────────────────────────────

export async function updateSprite(
  storyId: string,
  characterId: string,
  spriteId: string,
  updates: Partial<Omit<CharacterSprite, 'id' | 'createdAt'>>
): Promise<void> {
  const library = await getCharacterLibrary(storyId);
  const character = library.find((c) => c.id === characterId);
  if (!character) throw new Error('Character not found');

  const spriteIndex = character.sprites.findIndex((s) => s.id === spriteId);
  if (spriteIndex === -1) throw new Error('Sprite not found');

  character.sprites[spriteIndex] = { ...character.sprites[spriteIndex], ...updates };
  await saveCharacterLibrary(storyId, library);
}

// ── Delete Sprite ─────────────────────────────────────────────────────────

export async function deleteSprite(
  storyId: string,
  characterId: string,
  spriteId: string
): Promise<void> {
  const library = await getCharacterLibrary(storyId);
  const character = library.find((c) => c.id === characterId);
  if (!character) throw new Error('Character not found');

  character.sprites = character.sprites.filter((s) => s.id !== spriteId);

  // Update default if deleted
  if (character.defaultSpriteId === spriteId) {
    character.defaultSpriteId = character.sprites[0]?.id;
  }

  await saveCharacterLibrary(storyId, library);
}

// ── Search & Filter ───────────────────────────────────────────────────────

export async function searchCharacters(
  storyId: string,
  query: string
): Promise<Character[]> {
  const library = await getCharacterLibrary(storyId);
  const lowerQuery = query.toLowerCase();
  return library.filter((char) => char.name.toLowerCase().includes(lowerQuery));
}

export async function searchSprites(
  storyId: string,
  characterId: string,
  query: string
): Promise<CharacterSprite[]> {
  const library = await getCharacterLibrary(storyId);
  const character = library.find((c) => c.id === characterId);
  if (!character) return [];

  const lowerQuery = query.toLowerCase();
  return character.sprites.filter(
    (sprite) =>
      sprite.name.toLowerCase().includes(lowerQuery) ||
      sprite.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

export async function getSpritesByTag(
  storyId: string,
  characterId: string,
  tag: string
): Promise<CharacterSprite[]> {
  const library = await getCharacterLibrary(storyId);
  const character = library.find((c) => c.id === characterId);
  if (!character) return [];

  return character.sprites.filter((sprite) =>
    sprite.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
  );
}

// ── Import/Export ─────────────────────────────────────────────────────────

export async function importCharacterLibrary(
  targetStoryId: string,
  sourceStoryId: string
): Promise<void> {
  const sourceLibrary = await getCharacterLibrary(sourceStoryId);
  const targetLibrary = await getCharacterLibrary(targetStoryId);

  // Merge libraries, regenerating IDs to avoid conflicts
  const importedCharacters = sourceLibrary.map((char) => ({
    ...char,
    id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sprites: char.sprites.map((sprite) => ({
      ...sprite,
      id: `sprite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    })),
  }));

  await saveCharacterLibrary(targetStoryId, [...targetLibrary, ...importedCharacters]);
}

export async function exportCharacterLibrary(storyId: string): Promise<string> {
  const library = await getCharacterLibrary(storyId);
  return JSON.stringify({ characters: library }, null, 2);
}

export async function importCharacterLibraryFromJSON(
  storyId: string,
  json: string
): Promise<void> {
  const parsed: CharacterLibrary = JSON.parse(json);
  const targetLibrary = await getCharacterLibrary(storyId);

  // Regenerate IDs
  const importedCharacters = parsed.characters.map((char) => ({
    ...char,
    id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sprites: char.sprites.map((sprite) => ({
      ...sprite,
      id: `sprite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    })),
  }));

  await saveCharacterLibrary(storyId, [...targetLibrary, ...importedCharacters]);
}

// ── Get Character by ID ───────────────────────────────────────────────────

export async function getCharacter(
  storyId: string,
  characterId: string
): Promise<Character | undefined> {
  const library = await getCharacterLibrary(storyId);
  return library.find((c) => c.id === characterId);
}

export async function getSprite(
  storyId: string,
  characterId: string,
  spriteId: string
): Promise<CharacterSprite | undefined> {
  const character = await getCharacter(storyId, characterId);
  return character?.sprites.find((s) => s.id === spriteId);
}
