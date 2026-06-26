import {
  findCharacterCaseInsensitive,
  normalizeSpeakerNameForDisplay,
  normalizeSpeakerNameForLookup,
  resolveCharacterSpriteUri,
} from '@/lib/character-resolver';
import {
  CHARACTER_AUTHORING_SCHEMA_VERSION,
  migrateCharacterLibrary,
} from '@/lib/character-migration';
import type { Character } from '@/lib/character-types';

const character: Character = {
  id: 'char_masha',
  name: 'Маша',
  color: '#ff4d6d',
  sprites: [
    { id: 'sprite_neutral', name: 'Neutral', uri: 'file://neutral.png', createdAt: 1 },
    { id: 'sprite_happy', name: 'Happy', uri: 'file://happy.png', createdAt: 2 },
  ],
  defaultSpriteId: 'sprite_neutral',
  authoring: {
    currentSpriteId: 'sprite_happy',
    currentPosition: 'center',
    focusOnSpeak: true,
  },
  createdAt: 1,
};

describe('character resolver', () => {
  it('normalizes speaker names for display and lookup', () => {
    expect(normalizeSpeakerNameForDisplay('  Маша   Іванова  ')).toBe('Маша Іванова');
    expect(normalizeSpeakerNameForLookup('  МАША  ')).toBe('маша');
  });

  it('finds characters case-insensitively without changing display name', () => {
    const found = findCharacterCaseInsensitive({ story_1: [character] }, 'story_1', '  маша ');

    expect(found?.id).toBe('char_masha');
    expect(found?.name).toBe('Маша');
  });

  it('resolves explicit sprite ids to sprite URIs', () => {
    expect(resolveCharacterSpriteUri('char_masha', 'sprite_neutral', { story_1: [character] }, 'story_1'))
      .toBe('file://neutral.png');
  });

  it('falls back to authoring and default sprite ids', () => {
    expect(resolveCharacterSpriteUri('char_masha', '', { story_1: [character] }, 'story_1'))
      .toBe('file://happy.png');

    const withoutAuthoring = { ...character, authoring: undefined };
    expect(resolveCharacterSpriteUri('char_masha', '', { story_1: [withoutAuthoring] }, 'story_1'))
      .toBe('file://neutral.png');
  });

  it('returns null for missing story, character, or sprite', () => {
    expect(resolveCharacterSpriteUri('missing', 'sprite_neutral', { story_1: [character] }, 'story_1'))
      .toBeNull();
    expect(resolveCharacterSpriteUri('char_masha', 'missing', { story_1: [character] }, 'story_1'))
      .toBe('file://happy.png');
    expect(resolveCharacterSpriteUri('char_masha', 'missing', {}, 'story_1')).toBeNull();
  });
});

describe('character migration', () => {
  it('adds stable authoring metadata without losing sprites', () => {
    const migrated = migrateCharacterLibrary([
      {
        id: 'char_oleg',
        name: 'Олег',
        sprites: [{ id: 'sprite_idle', name: 'Idle', uri: 'file://idle.png', createdAt: 1 }],
        defaultSpriteId: 'sprite_idle',
        createdAt: 1,
      },
    ]);

    expect(migrated[0].sprites[0].name).toBe('Idle');
    expect(migrated[0].color).toMatch(/^#/);
    expect(migrated[0].authoring?.currentSpriteId).toBe('sprite_idle');
    expect(migrated[0].authoring?.currentPosition).toBe('center');
    expect(migrated[0].characterAuthoringSchemaVersion).toBe(CHARACTER_AUTHORING_SCHEMA_VERSION);
  });

  it('is idempotent', () => {
    const once = migrateCharacterLibrary([character]);
    const twice = migrateCharacterLibrary(once);

    expect(twice).toEqual(once);
  });
});
