/**
 * The two pointers a character keeps into its own sprite list.
 *
 * `defaultSpriteId` decides what the library calls the character's default;
 * `authoring.currentSpriteId` decides what the editor inserts next. Either one
 * naming a sprite that is no longer there is not fatal — the resolver skips
 * candidates it cannot find — but it makes the character read as having no
 * default at all, and it is a state the app itself produces: the iframe editor
 * repaired only one of the two when deleting a sprite.
 */
import { migrateCharacter, migrateCharacterLibrary } from '@/lib/character-migration';
import type { Character, CharacterSprite } from '@/lib/character-types';

function sprite(id: string): CharacterSprite {
  return { id, name: id, uri: `file://${id}.png`, createdAt: 1 };
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'alice',
    name: 'Alice',
    color: '#ff0000',
    createdAt: 1,
    sprites: [sprite('happy'), sprite('sad')],
    ...overrides,
  };
}

describe('sprite pointers', () => {
  it('keeps a default that names a sprite the character has', () => {
    const migrated = migrateCharacter(character({ defaultSpriteId: 'sad' }));

    expect(migrated.defaultSpriteId).toBe('sad');
    expect(migrated.authoring?.currentSpriteId).toBe('sad');
  });

  // Exactly what the editor used to leave behind after deleting the default.
  it('drops a default naming a sprite that is gone', () => {
    const migrated = migrateCharacter(character({ defaultSpriteId: 'deleted' }));

    expect(migrated).not.toHaveProperty('defaultSpriteId');
    expect(migrated.authoring?.currentSpriteId).toBe('happy');
  });

  it('drops a current selection naming a sprite that is gone', () => {
    const migrated = migrateCharacter(character({
      defaultSpriteId: 'sad',
      authoring: { currentSpriteId: 'deleted' },
    }));

    expect(migrated.authoring?.currentSpriteId).toBe('sad');
  });

  it('leaves a character with no sprites holding neither pointer', () => {
    const migrated = migrateCharacter(character({
      sprites: [],
      defaultSpriteId: 'deleted',
      authoring: { currentSpriteId: 'deleted' },
    }));

    expect(migrated).not.toHaveProperty('defaultSpriteId');
    expect(migrated.authoring?.currentSpriteId).toBeUndefined();
  });

  // The merge fingerprints a character by stringifying it, where an absent key
  // and one holding undefined are the same value but not the same text.
  it('removes the key rather than setting it to undefined', () => {
    const migrated = migrateCharacter(character({ defaultSpriteId: 'deleted' }));

    expect(Object.keys(migrated)).not.toContain('defaultSpriteId');
  });

  it('leaves the rest of the character alone', () => {
    const migrated = migrateCharacter(character({
      defaultSpriteId: 'deleted',
      authoring: { currentSpriteId: 'happy', currentPosition: 'left', focusOnSpeak: false },
    }));

    expect(migrated).toMatchObject({
      id: 'alice',
      name: 'Alice',
      color: '#ff0000',
      authoring: { currentPosition: 'left', focusOnSpeak: false },
    });
    expect(migrated.sprites).toHaveLength(2);
  });

  it('repairs every character in a library', () => {
    const migrated = migrateCharacterLibrary([
      character({ defaultSpriteId: 'deleted' }),
      character({ id: 'bob', name: 'Bob', defaultSpriteId: 'happy' }),
    ]);

    expect(migrated[0]).not.toHaveProperty('defaultSpriteId');
    expect(migrated[1].defaultSpriteId).toBe('happy');
  });
});
