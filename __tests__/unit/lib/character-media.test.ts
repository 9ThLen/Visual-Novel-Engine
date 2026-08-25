/**
 * Additive ownership.
 *
 * The rule this file defends is that attaching a file to a character never
 * moves anything: the timeline names a sprite by `${characterId}:${spriteId}`,
 * so a transfer would dangle every reference to it. Detaching is allowed only
 * when nothing references the sprite, which is why the interesting cases here
 * are the two pointers into the sprite list — both have to be repaired, or the
 * character silently loses its default.
 */
import {
  attachSpriteToCharacter,
  detachSpriteFromCharacter,
  spriteNameFromFileName,
} from '@/lib/character-media';
import type { Character } from '@/lib/character-types';

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'alice',
    name: 'Alice',
    color: '#ff0000',
    createdAt: 1,
    sprites: [],
    ...overrides,
  };
}

const ids = () => {
  let count = 0;
  return () => `sprite-${(count += 1)}`;
};

function attach(characters: Character[], overrides: Partial<Parameters<typeof attachSpriteToCharacter>[0]> = {}) {
  return attachSpriteToCharacter({
    characters,
    characterId: 'alice',
    ref: 'asset-1',
    name: 'portrait',
    now: 1000,
    createId: ids(),
    ...overrides,
  });
}

describe('attaching a file to a character', () => {
  it('adds a sprite for the file and touches nothing else', () => {
    const bob = character({ id: 'bob', name: 'Bob' });
    const next = attach([character(), bob]);

    expect(next[0].sprites).toEqual([
      { id: 'sprite-1', name: 'portrait', uri: 'asset-1', createdAt: 1000 },
    ]);
    // The other character is the same object: no library-wide rewrite.
    expect(next[1]).toBe(bob);
  });

  // `assetUri` is the web editor's runtime pair for `uri`. A sprite created
  // here has one URI and it is already persistent, so writing both fields
  // would hand the merge a pair to reconcile for no reason.
  it('never writes assetUri', () => {
    const next = attach([character()]);
    expect(next[0].sprites[0]).not.toHaveProperty('assetUri');
  });

  it('keeps the file reference verbatim so the gallery still folds them together', () => {
    const byUri = attach([character()], { ref: 'file://portrait.png' });
    expect(byUri[0].sprites[0].uri).toBe('file://portrait.png');
  });

  it('gives a character its first default sprite', () => {
    const next = attach([character()]);
    expect(next[0].defaultSpriteId).toBe('sprite-1');
  });

  it('leaves an existing default alone', () => {
    const existing = character({
      sprites: [{ id: 'happy', name: 'Happy', uri: 'other', createdAt: 1 }],
      defaultSpriteId: 'happy',
    });
    const next = attach([existing]);

    expect(next[0].defaultSpriteId).toBe('happy');
    expect(next[0].sprites).toHaveLength(2);
  });

  // The AI change-set validator rejects a duplicate sprite name outright, so a
  // library that created one would produce a story the assistant then refuses
  // to edit.
  it('deduplicates the sprite name against the ones already there', () => {
    const existing = character({
      sprites: [
        { id: 'a', name: 'portrait', uri: 'x', createdAt: 1 },
        { id: 'b', name: 'Portrait 2', uri: 'y', createdAt: 1 },
      ],
    });
    const next = attach([existing]);

    expect(next[0].sprites[2].name).toBe('portrait 3');
  });

  it('refuses to add the same file to the same character twice', () => {
    const characters = [character()];
    const once = attach(characters);
    const twice = attach(once);

    expect(twice).toBe(once);
  });

  // An imported backup parks the persistent value in `assetUri` and a runtime
  // one in `uri`. The character owns the file through either spelling.
  it('recognises the file through a sprite that parked it in assetUri', () => {
    const characters = [character({
      sprites: [{ id: 'happy', name: 'Happy', uri: 'blob:runtime', assetUri: 'asset-1', createdAt: 1 }],
    })];
    expect(attach(characters)).toBe(characters);
  });

  it('returns the input untouched for an unknown character', () => {
    const characters = [character()];
    expect(attach(characters, { characterId: 'nobody' })).toBe(characters);
  });
});

describe('detaching a sprite from a character', () => {
  const twoSprites = () => character({
    sprites: [
      { id: 'happy', name: 'Happy', uri: 'asset-1', createdAt: 1 },
      { id: 'sad', name: 'Sad', uri: 'asset-2', createdAt: 2 },
    ],
    defaultSpriteId: 'happy',
    authoring: { currentSpriteId: 'happy', currentPosition: 'center' },
  });

  it('removes the sprite', () => {
    const next = detachSpriteFromCharacter([twoSprites()], 'alice', 'happy');
    expect(next[0].sprites.map((sprite) => sprite.id)).toEqual(['sad']);
  });

  // The editor repairs `authoring.currentSpriteId` on delete and leaves
  // `defaultSpriteId` pointing at the sprite it just removed. Both pointers
  // have to move, or `isDefaultSprite` matches nothing and the character reads
  // as having no default at all.
  it('moves both pointers off the sprite it removed', () => {
    const next = detachSpriteFromCharacter([twoSprites()], 'alice', 'happy');

    expect(next[0].defaultSpriteId).toBe('sad');
    expect(next[0].authoring?.currentSpriteId).toBe('sad');
  });

  it('drops both pointers when the last sprite goes', () => {
    const only = character({
      sprites: [{ id: 'happy', name: 'Happy', uri: 'asset-1', createdAt: 1 }],
      defaultSpriteId: 'happy',
      authoring: { currentSpriteId: 'happy' },
    });
    const next = detachSpriteFromCharacter([only], 'alice', 'happy');

    expect(next[0].sprites).toEqual([]);
    expect(next[0]).not.toHaveProperty('defaultSpriteId');
    expect(next[0].authoring?.currentSpriteId).toBeUndefined();
  });

  it('leaves pointers that named a different sprite where they are', () => {
    const next = detachSpriteFromCharacter([twoSprites()], 'alice', 'sad');

    expect(next[0].defaultSpriteId).toBe('happy');
    expect(next[0].authoring?.currentSpriteId).toBe('happy');
  });

  it('leaves the rest of the library alone', () => {
    const bob = character({ id: 'bob', name: 'Bob' });
    const next = detachSpriteFromCharacter([twoSprites(), bob], 'alice', 'happy');
    expect(next[1]).toBe(bob);
  });

  it('returns the input untouched for an unknown sprite or character', () => {
    const characters = [twoSprites()];
    expect(detachSpriteFromCharacter(characters, 'alice', 'nobody')).toBe(characters);
    expect(detachSpriteFromCharacter(characters, 'nobody', 'happy')).toBe(characters);
  });
});

describe('sprite names from file names', () => {
  it('drops the extension', () => {
    expect(spriteNameFromFileName('alice-happy.png')).toBe('alice-happy');
  });

  it('keeps a name that has none', () => {
    expect(spriteNameFromFileName('portrait')).toBe('portrait');
  });
});
