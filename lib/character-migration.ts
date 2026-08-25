import type {
  Character,
  CharacterEntranceTransition,
  CharacterPosition,
} from '@/lib/character-types';

export const CHARACTER_AUTHORING_SCHEMA_VERSION = 3;

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

function isCharacterEntranceTransition(value: unknown): value is CharacterEntranceTransition {
  return value === 'instant'
    || value === 'fade'
    || value === 'slide-left'
    || value === 'slide-right'
    || value === 'zoom';
}

/**
 * Both pointers into the sprite list must name a sprite the character actually
 * has. The iframe editor repairs only `authoring.currentSpriteId` when it
 * deletes a sprite and leaves `defaultSpriteId` on the one it just removed, so
 * characters carrying a dangling default already exist in saved stories.
 *
 * Repairing here rather than only at the source fixes those too: every path
 * that writes a character library runs this.
 */
export function migrateCharacter(character: Character): Character {
  const names = (spriteId: string | undefined): spriteId is string =>
    !!spriteId && character.sprites.some((sprite) => sprite.id === spriteId);

  const defaultSpriteId = names(character.defaultSpriteId) ? character.defaultSpriteId : undefined;
  const currentSpriteId = names(character.authoring?.currentSpriteId)
    ? character.authoring?.currentSpriteId
    : defaultSpriteId ?? character.sprites[0]?.id;
  const currentPosition = isCharacterPosition(character.authoring?.currentPosition)
    ? character.authoring?.currentPosition
    : 'center';
  const entranceTransition = isCharacterEntranceTransition(character.authoring?.entranceTransition)
    ? character.authoring.entranceTransition
    : 'fade';
  const exitTransition = isCharacterEntranceTransition(character.authoring?.exitTransition)
    ? character.authoring.exitTransition
    : 'fade';

  const migrated: Character = {
    ...character,
    color: character.color || stableColorForCharacter(character),
    authoring: {
      currentSpriteId,
      currentPosition,
      entranceTransition,
      exitTransition,
      focusOnSpeak: character.authoring?.focusOnSpeak ?? true,
    },
    characterAuthoringSchemaVersion: CHARACTER_AUTHORING_SCHEMA_VERSION,
  };

  // Deleted rather than set to undefined: the three-way merge fingerprints a
  // character by stringifying it, where a present-but-undefined key and an
  // absent one are the same value but not the same text.
  if (defaultSpriteId) migrated.defaultSpriteId = defaultSpriteId;
  else delete migrated.defaultSpriteId;

  return migrated;
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
