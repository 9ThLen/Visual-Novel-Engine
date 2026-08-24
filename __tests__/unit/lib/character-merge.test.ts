import { charactersEquivalent, mergeExternalCharacters } from '@/lib/character-merge';
import type { Character, CharacterSprite } from '@/lib/character-types';

function sprite(id: string, overrides: Partial<CharacterSprite> = {}): CharacterSprite {
  return { id, name: id, uri: `file://${id}.png`, createdAt: 1, ...overrides };
}

function character(id: string, sprites: CharacterSprite[], overrides: Partial<Character> = {}): Character {
  return { id, name: id, sprites, color: '#111111', createdAt: 1, ...overrides };
}

describe('mergeExternalCharacters', () => {
  it('adopts a sprite added externally while the editor is dirty', () => {
    const base = [character('alice', [sprite('happy')])];
    const local = [character('alice', [sprite('happy')], { name: 'Alice (renamed)' })];
    const incoming = [character('alice', [sprite('happy'), sprite('sad')])];

    const merged = mergeExternalCharacters(base, local, incoming);

    expect(merged[0].sprites.map((item) => item.id)).toEqual(['happy', 'sad']);
    // The unrelated local edit survives the merge.
    expect(merged[0].name).toBe('Alice (renamed)');
  });

  it('keeps a sprite the author created locally', () => {
    const base = [character('alice', [sprite('happy')])];
    const local = [character('alice', [sprite('happy'), sprite('draft')])];
    const incoming = [character('alice', [sprite('happy')])];

    const merged = mergeExternalCharacters(base, local, incoming);

    expect(merged[0].sprites.map((item) => item.id)).toEqual(['happy', 'draft']);
  });

  it('does not resurrect a sprite deleted externally', () => {
    const base = [character('alice', [sprite('happy'), sprite('aiMade')])];
    const local = [character('alice', [sprite('happy'), sprite('aiMade')])];
    const incoming = [character('alice', [sprite('happy')])];

    const merged = mergeExternalCharacters(base, local, incoming);

    expect(merged[0].sprites.map((item) => item.id)).toEqual(['happy']);
  });

  it('keeps an externally deleted sprite that the author edited', () => {
    const base = [character('alice', [sprite('happy')])];
    const local = [character('alice', [sprite('happy', { name: 'Renamed by author' })])];
    const incoming = [character('alice', [])];

    const merged = mergeExternalCharacters(base, local, incoming);

    expect(merged[0].sprites.map((item) => item.id)).toEqual(['happy']);
    expect(merged[0].sprites[0].name).toBe('Renamed by author');
  });

  it('restores name, color and defaultSpriteId the author never touched', () => {
    const base = [character('alice', [sprite('happy')], { name: 'AI name', color: '#aaaaaa', defaultSpriteId: 'happy' })];
    const local = [character('alice', [sprite('happy')], { name: 'AI name', color: '#aaaaaa', defaultSpriteId: 'happy' })];
    const incoming = [character('alice', [sprite('happy')], { name: 'Alice', color: '#bbbbbb', defaultSpriteId: undefined })];

    const merged = mergeExternalCharacters(base, local, incoming);

    expect(merged[0].name).toBe('Alice');
    expect(merged[0].color).toBe('#bbbbbb');
    expect(merged[0].defaultSpriteId).toBeUndefined();
  });

  it('gives the author the same field on conflict', () => {
    const base = [character('alice', [sprite('happy')], { name: 'Base' })];
    const local = [character('alice', [sprite('happy')], { name: 'Author' })];
    const incoming = [character('alice', [sprite('happy')], { name: 'External' })];

    expect(mergeExternalCharacters(base, local, incoming)[0].name).toBe('Author');
  });

  it('adds a character created externally and keeps one created locally', () => {
    const base = [character('alice', [])];
    const local = [character('alice', []), character('localOnly', [])];
    const incoming = [character('alice', []), character('bob', [])];

    const merged = mergeExternalCharacters(base, local, incoming);

    expect(merged.map((item) => item.id)).toEqual(['alice', 'bob', 'localOnly']);
  });

  it('does not resurrect a character deleted externally', () => {
    const base = [character('alice', []), character('aiMade', [])];
    const local = [character('alice', []), character('aiMade', [])];
    const incoming = [character('alice', [])];

    expect(mergeExternalCharacters(base, local, incoming).map((item) => item.id)).toEqual(['alice']);
  });

  // The web editor swaps `uri` for a runtime blob: and keeps the persistent one
  // in `assetUri`. That difference must not read as an author edit, or the
  // merge silently degrades to "local always wins".
  it('treats an assetUri/uri difference for the same target as no edit', () => {
    const base = [character('alice', [sprite('happy', { uri: 'file://happy.png' })])];
    const local = [character('alice', [
      sprite('happy', { uri: 'blob:runtime-preview', assetUri: 'file://happy.png' }),
    ])];
    const incoming = [character('alice', [
      sprite('happy', { uri: 'file://happy.png', name: 'Renamed externally' }),
    ])];

    const merged = mergeExternalCharacters(base, local, incoming);

    expect(merged[0].sprites[0].name).toBe('Renamed externally');
  });

  it('honours an external delete of a sprite the editor only re-pointed to a blob', () => {
    const base = [character('alice', [sprite('happy', { uri: 'file://happy.png' })])];
    const local = [character('alice', [
      sprite('happy', { uri: 'blob:runtime-preview', assetUri: 'file://happy.png' }),
    ])];
    const incoming = [character('alice', [])];

    expect(mergeExternalCharacters(base, local, incoming)[0].sprites).toEqual([]);
  });

  // Presence on one side only is ambiguous without the base: these four cases
  // are the ones a two-way merge cannot tell apart.
  it('does not resurrect a sprite the author deleted locally', () => {
    const base = [character('alice', [sprite('happy'), sprite('sad')])];
    const local = [character('alice', [sprite('happy')])];
    const incoming = [character('alice', [sprite('happy'), sprite('sad')])];

    const merged = mergeExternalCharacters(base, local, incoming);

    expect(merged[0].sprites.map((item) => item.id)).toEqual(['happy']);
  });

  it('does not resurrect a character the author deleted locally', () => {
    const base = [character('alice', []), character('bob', [])];
    const local = [character('alice', [])];
    const incoming = [character('alice', []), character('bob', [])];

    expect(mergeExternalCharacters(base, local, incoming).map((item) => item.id)).toEqual(['alice']);
  });

  it('still adopts an external add while an unrelated local delete stands', () => {
    const base = [character('alice', [sprite('happy'), sprite('sad')])];
    const local = [character('alice', [sprite('happy')])];
    const incoming = [character('alice', [sprite('happy'), sprite('sad'), sprite('angry')])];

    const merged = mergeExternalCharacters(base, local, incoming);

    expect(merged[0].sprites.map((item) => item.id)).toEqual(['happy', 'angry']);
  });

  it('keeps a local delete even when the external side edited that sprite', () => {
    const base = [character('alice', [sprite('happy')])];
    const local = [character('alice', [])];
    const incoming = [character('alice', [sprite('happy', { name: 'Renamed externally' })])];

    expect(mergeExternalCharacters(base, local, incoming)[0].sprites).toEqual([]);
  });

  it('handles empty inputs', () => {
    expect(mergeExternalCharacters([], [], [])).toEqual([]);
    expect(mergeExternalCharacters([], [], [character('alice', [])]).map((item) => item.id)).toEqual(['alice']);
    expect(mergeExternalCharacters([], [character('alice', [])], []).map((item) => item.id)).toEqual(['alice']);
  });
});

describe('charactersEquivalent', () => {
  it('ignores a blob preview swap', () => {
    const a = [character('alice', [sprite('happy', { uri: 'file://happy.png' })])];
    const b = [character('alice', [sprite('happy', { uri: 'blob:x', assetUri: 'file://happy.png' })])];

    expect(charactersEquivalent(a, b)).toBe(true);
  });

  it('sees a real change', () => {
    const a = [character('alice', [sprite('happy')])];
    const b = [character('alice', [sprite('happy', { name: 'Other' })])];

    expect(charactersEquivalent(a, b)).toBe(false);
    expect(charactersEquivalent(a, [])).toBe(false);
  });
});
