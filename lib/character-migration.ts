import type { Character, CharacterPosition } from '@/lib/character-types';

export const CHARACTER_AUTHORING_SCHEMA_VERSION = 1;

const CHARACTER_COLOR_PALETTE = [
  '#ff4d6d',
  '#14b8a6',
  '#3b82f6',
  '#f59e0b',
  '#8b5cf6',
  '#22c55e',
  '#ef4444',
  '#06b6d4',
];

function stableColorForCharacter(character: Pick<Character, 'id' | 'name'>): string {
  const key = character.id || character.name;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return CHARACTER_COLOR_PALETTE[hash % CHARACTER_COLOR_PALETTE.length];
}

function isCharacterPosition(value: unknown): value is CharacterPosition {
  return value === 'far-left'
    || value === 'left'
    || value === 'center'
    || value === 'right'
    || value === 'far-right';
}

export function migrateCharacter(character: Character): Character {
  const currentSpriteId = character.authoring?.currentSpriteId
    ?? character.defaultSpriteId
    ?? character.sprites[0]?.id;
  const currentPosition = isCharacterPosition(character.authoring?.currentPosition)
    ? character.authoring?.currentPosition
    : 'center';

  return {
    ...character,
    color: character.color || stableColorForCharacter(character),
    authoring: {
      currentSpriteId,
      currentPosition,
      focusOnSpeak: character.authoring?.focusOnSpeak ?? true,
    },
    characterAuthoringSchemaVersion: CHARACTER_AUTHORING_SCHEMA_VERSION,
  };
}

export function migrateCharacterLibrary(characters: Character[] | undefined | null): Character[] {
  if (!Array.isArray(characters)) return [];
  return characters.map(migrateCharacter);
}

export function migrateCharacterLibraries(
  libraries: Record<string, Character[]> | undefined | null
): Record<string, Character[]> {
  if (!libraries) return {};
  return Object.fromEntries(
    Object.entries(libraries).map(([storyId, characters]) => [
      storyId,
      migrateCharacterLibrary(characters),
    ])
  );
}
