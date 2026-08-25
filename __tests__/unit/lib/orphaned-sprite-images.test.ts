/**
 * Keeping the picture when the sprite holding it goes.
 *
 * A sprite's image need not be in the media library: one imported through a
 * character lives as a bare URI on the sprite, and is listed only because the
 * sprite points at it. Deleting the character used to take the picture out of
 * every screen that could offer it back — the file survived in storage,
 * unreachable, until the media collector swept it.
 */
import type { Character, CharacterSprite } from '@/lib/character-types';
import type { LibraryAsset } from '@/lib/media-library-service';
import { keepOrphanedSpriteImages } from '@/lib/orphaned-sprite-images';

const STORY = 'story-1';
let nextId = 0;
const createAssetId = () => `asset-new-${(nextId += 1)}`;

beforeEach(() => { nextId = 0; });

function sprite(id: string, overrides: Partial<CharacterSprite> = {}): CharacterSprite {
  return { id, name: id, uri: `file://${id}.png`, createdAt: 1, ...overrides };
}

function character(id: string, sprites: CharacterSprite[]): Character {
  return { id, name: id, sprites, createdAt: 1 };
}

function asset(overrides: Partial<LibraryAsset> & { id: string }): LibraryAsset {
  return {
    type: 'image',
    uri: `file://${overrides.id}.png`,
    name: `${overrides.id}.png`,
    addedAt: 1,
    ...overrides,
  };
}

function run(previous: Character[], next: Character[], overrides: Partial<Parameters<typeof keepOrphanedSpriteImages>[0]> = {}) {
  return keepOrphanedSpriteImages({
    storyId: STORY,
    previous,
    next,
    mediaLibrary: [],
    imageAssetIdsByStory: {},
    now: 5000,
    createAssetId,
    ...overrides,
  });
}

describe('keeping an orphaned sprite image', () => {
  it('turns the picture of a deleted character into an image of the story', () => {
    const result = run([character('alice', [sprite('happy')])], []);

    expect(result?.mediaLibrary).toEqual([
      { id: 'asset-new-1', type: 'image', uri: 'file://happy.png', name: 'happy', addedAt: 5000 },
    ]);
    expect(result?.imageAssetIdsByStory[STORY]).toEqual(['asset-new-1']);
  });

  it('keeps one picture per deleted sprite', () => {
    const result = run([character('alice', [sprite('happy'), sprite('sad')])], []);

    expect(result?.mediaLibrary.map((item) => item.uri))
      .toEqual(['file://happy.png', 'file://sad.png']);
  });

  // Deleting one sprite is the same loss as deleting the character that held
  // it, and arrives here the same way.
  it('rescues a single removed sprite, not only a whole character', () => {
    const result = run(
      [character('alice', [sprite('happy'), sprite('sad')])],
      [character('alice', [sprite('happy')])],
    );

    expect(result?.mediaLibrary.map((item) => item.uri)).toEqual(['file://sad.png']);
  });

  it('does nothing when no sprite was removed', () => {
    expect(run(
      [character('alice', [sprite('happy')])],
      [character('alice', [sprite('happy'), sprite('sad')])],
    )).toBeNull();
  });

  // The same file on another character is still reachable, so there is nothing
  // to rescue and nothing to duplicate.
  it('ignores a picture another sprite still points at', () => {
    const shared = { uri: 'file://shared.png' };
    expect(run(
      [character('alice', [sprite('happy', shared)]), character('bob', [sprite('calm', shared)])],
      [character('bob', [sprite('calm', shared)])],
    )).toBeNull();
  });

  // Already a library asset: nothing to create, but the story may not have
  // listed it, because the sprite was what pulled it in.
  it('adds an existing asset to the story rather than copying it', () => {
    const existing = asset({ id: 'a1', uri: 'file://happy.png' });
    const result = run([character('alice', [sprite('happy')])], [], { mediaLibrary: [existing] });

    expect(result?.mediaLibrary).toEqual([existing]);
    expect(result?.imageAssetIdsByStory[STORY]).toEqual(['a1']);
  });

  it('does nothing when the asset is already the story’s', () => {
    expect(run([character('alice', [sprite('happy')])], [], {
      mediaLibrary: [asset({ id: 'a1', uri: 'file://happy.png' })],
      imageAssetIdsByStory: { [STORY]: ['a1'] },
    })).toBeNull();
  });

  // A sprite whose `uri` is an asset id — how the assistant and the media
  // library both write them.
  it('recognises a sprite that refers to an asset by id', () => {
    const result = run([character('alice', [sprite('happy', { uri: 'a1' })])], [], {
      mediaLibrary: [asset({ id: 'a1' })],
    });

    expect(result?.mediaLibrary).toHaveLength(1);
    expect(result?.imageAssetIdsByStory[STORY]).toEqual(['a1']);
  });

  // `assetUri` holds the persistent value while `uri` carries the editor's
  // runtime handle; rescuing the handle would create an entry that breaks on
  // the next reload.
  it('keeps the persistent URI, not the editor’s temporary one', () => {
    const result = run(
      [character('alice', [sprite('happy', { uri: 'blob:runtime', assetUri: 'file://happy.png' })])],
      [],
    );

    expect(result?.mediaLibrary[0].uri).toBe('file://happy.png');
  });

  it('refuses to rescue a picture that only exists as a runtime blob', () => {
    expect(run([character('alice', [sprite('happy', { uri: 'blob:runtime' })])], [])).toBeNull();
  });

  // One file has up to four spellings on a sprite — `assetUri` or `uri`, each
  // holding an asset id or its URI. A sprite rewritten from one to another is
  // the same picture, and reading it as a lost one would duplicate the asset.
  it('sees through a sprite rewritten from an asset id to its URI', () => {
    const existing = asset({ id: 'a1', uri: 'file://happy.png' });
    const result = run(
      [character('alice', [sprite('happy', { uri: 'a1' })])],
      [character('alice', [sprite('happy', { uri: 'file://happy.png' })])],
      { mediaLibrary: [existing] },
    );

    expect(result).toBeNull();
  });

  it('sees through a sprite that moved its reference into assetUri', () => {
    const existing = asset({ id: 'a1', uri: 'file://happy.png' });
    const result = run(
      [character('alice', [sprite('happy', { uri: 'file://happy.png' })])],
      [character('alice', [sprite('happy', { uri: 'blob:runtime', assetUri: 'a1' })])],
      { mediaLibrary: [existing] },
    );

    expect(result).toBeNull();
  });

  // The same picture on two sprites, spelled differently: removing one leaves
  // the file reachable through the other.
  it('counts two spellings of one file as one picture', () => {
    const existing = asset({ id: 'a1', uri: 'file://happy.png' });
    const result = run(
      [
        character('alice', [sprite('happy', { uri: 'a1' })]),
        character('bob', [sprite('calm', { uri: 'file://happy.png' })]),
      ],
      [character('bob', [sprite('calm', { uri: 'file://happy.png' })])],
      { mediaLibrary: [existing] },
    );

    expect(result).toBeNull();
  });

  it('names the image after the sprite', () => {
    const result = run([character('alice', [sprite('happy', { name: 'Alice smiling' })])], []);

    expect(result?.mediaLibrary[0].name).toBe('Alice smiling');
  });

  it('has nothing to do for a story with no characters before the write', () => {
    expect(run([], [character('alice', [sprite('happy')])])).toBeNull();
  });
});
