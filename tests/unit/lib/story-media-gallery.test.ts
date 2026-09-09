import {
  buildStoryMediaGallery,
  canDetachOwner,
  findOwnerInGallery,
  canRemoveFromStory,
  filterMediaItems,
  groupMediaByDate,
  type StoryMediaGalleryInput,
} from '@/lib/story-media-gallery';
import { setAudioCategoryInLibrary } from '@/lib/audio-category';
import type { Character, CharacterSprite } from '@/lib/character-types';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

function asset(overrides: Partial<LibraryAsset> & { id: string }): LibraryAsset {
  return {
    type: 'image',
    uri: `file://${overrides.id}.png`,
    name: `${overrides.id}.png`,
    addedAt: 1_000,
    ...overrides,
  };
}

function sprite(id: string, overrides: Partial<CharacterSprite> = {}): CharacterSprite {
  return { id, name: id, uri: `file://${id}.png`, createdAt: 1_000, ...overrides };
}

function character(id: string, sprites: CharacterSprite[], overrides: Partial<Character> = {}): Character {
  return { id, name: id, sprites, color: '#123456', createdAt: 1, ...overrides };
}

function step(id: string, blockType: TimelineStep['blockType'], data: unknown, enabled = true): TimelineStep {
  return { id, blockType, data, enabled, collapsed: false } as TimelineStep;
}

function scene(id: string, timeline: TimelineStep[], name = id): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name,
    description: '',
    tags: [],
    timeline,
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function build(overrides: Partial<StoryMediaGalleryInput> = {}) {
  return buildStoryMediaGallery({
    storyId: 'story-1',
    mediaLibrary: [],
    imageAssetIdsByStory: {},
    mediaAssetIdsByStory: {},
    characters: [],
    scenes: [],
    ...overrides,
  });
}

describe('buildStoryMediaGallery', () => {
  it('returns empty collections for an empty story', () => {
    const gallery = build();
    expect(gallery).toEqual({
      images: [],
      videos: [],
      audios: [],
      characterFilters: [],
      counts: { images: 0, videos: 0, audios: 0, used: 0, unused: 0 },
    });
  });

  it('folds an asset and the sprite that reuses its URI into one tile', () => {
    const bg = asset({ id: 'a1', uri: 'file://alice-happy.png' });
    const gallery = build({
      mediaLibrary: [bg],
      imageAssetIdsByStory: { 'story-1': ['a1'] },
      characters: [character('alice', [sprite('happy', { uri: 'file://alice-happy.png' })])],
    });

    expect(gallery.images).toHaveLength(1);
    expect(gallery.images[0].assetId).toBe('a1');
    expect(gallery.images[0].owners.map((owner) => owner.characterId)).toEqual(['alice']);
    expect(gallery.counts.images).toBe(1);
  });

  it('folds a backup-imported sprite whose assetUri points at an existing asset', () => {
    const bg = asset({ id: 'a1', uri: 'file://smile.png' });
    const gallery = build({
      mediaLibrary: [bg],
      imageAssetIdsByStory: { 'story-1': ['a1'] },
      characters: [character('alice', [
        sprite('happy', { uri: 'blob:runtime-preview', assetUri: 'file://smile.png' }),
      ])],
    });

    expect(gallery.images).toHaveLength(1);
    expect(gallery.images[0].assetId).toBe('a1');
  });

  it('folds a sprite that references an asset by id rather than URI', () => {
    const gallery = build({
      mediaLibrary: [asset({ id: 'a1' })],
      imageAssetIdsByStory: { 'story-1': ['a1'] },
      characters: [character('alice', [sprite('happy', { uri: 'a1' })])],
    });

    expect(gallery.images).toHaveLength(1);
    expect(gallery.images[0].assetId).toBe('a1');
  });

  it('gives one tile two owners when two characters share a URI', () => {
    const gallery = build({
      mediaLibrary: [asset({ id: 'a1', uri: 'file://shared.png' })],
      imageAssetIdsByStory: { 'story-1': ['a1'] },
      characters: [
        character('alice', [sprite('a', { uri: 'blob:one', assetUri: 'file://shared.png' })]),
        character('bob', [sprite('b', { uri: 'blob:two', assetUri: 'file://shared.png' })]),
      ],
    });

    expect(gallery.images).toHaveLength(1);
    expect(gallery.images[0].owners.map((owner) => owner.characterId)).toEqual(['alice', 'bob']);
  });

  // Two spellings pointing at different assets is malformed data; the point is
  // that the answer is fixed rather than depending on mediaLibrary order.
  it('resolves assetUri before uri when they disagree', () => {
    const gallery = build({
      mediaLibrary: [asset({ id: 'byUri', uri: 'file://by-uri.png' }), asset({ id: 'byAssetUri', uri: 'file://by-asset-uri.png' })],
      imageAssetIdsByStory: { 'story-1': ['byUri', 'byAssetUri'] },
      characters: [character('alice', [
        sprite('happy', { uri: 'file://by-uri.png', assetUri: 'file://by-asset-uri.png' }),
      ])],
    });

    const owned = gallery.images.filter((item) => item.owners.length > 0);
    expect(owned).toHaveLength(1);
    expect(owned[0].assetId).toBe('byAssetUri');
  });

  // The sprite is what brings the file into the story here: it is in the global
  // media library but not in this story's image membership.
  it('keeps the asset identity when only a sprite pulls the file into the story', () => {
    const gallery = build({
      mediaLibrary: [asset({ id: 'a1', uri: 'file://alice.png', name: 'alice.png', size: 4096, mimeType: 'image/png' })],
      characters: [character('alice', [sprite('happy', { uri: 'file://alice.png' })])],
    });

    expect(gallery.images).toHaveLength(1);
    expect(gallery.images[0]).toMatchObject({
      key: 'asset:a1',
      assetId: 'a1',
      name: 'alice.png',
      sizeBytes: 4096,
      mimeType: 'image/png',
    });
    expect(gallery.images[0].owners.map((owner) => owner.characterId)).toEqual(['alice']);
  });

  it('keeps a sprite outside the media library as its own tile without an assetId', () => {
    const gallery = build({
      characters: [character('alice', [sprite('happy', { uri: 'file://standalone.png' })])],
    });

    expect(gallery.images).toHaveLength(1);
    expect(gallery.images[0].assetId).toBeUndefined();
    expect(gallery.images[0].key).toBe('sprite-uri:file://standalone.png');
    expect(canRemoveFromStory(gallery.images[0])).toBe(false);
  });

  it('sums usage across every role the file plays', () => {
    const bg = asset({ id: 'a1', uri: 'file://alice.png' });
    const gallery = build({
      mediaLibrary: [bg],
      imageAssetIdsByStory: { 'story-1': ['a1'] },
      characters: [character('alice', [sprite('happy', { uri: 'file://alice.png' })])],
      scenes: [scene('s1', [
        step('b1', 'background', { assetId: 'a1' }),
        step('b2', 'background', { assetId: 'file://alice.png' }, false),
        step('c1', 'character', { characterId: 'alice', spriteId: 'happy', position: 'left', transition: 'instant', delay: 0, duration: null }),
      ])],
    });

    expect(gallery.images[0].usage).toEqual({ enabled: 2, disabled: 1 });
    expect(gallery.images[0].references.map((reference) => reference.sceneName)).toEqual(['s1', 's1', 's1']);
  });

  it('counts an image used only as a video poster as used', () => {
    const gallery = build({
      mediaLibrary: [asset({ id: 'poster' }), asset({ id: 'clip', type: 'video', uri: 'file://clip.mp4' })],
      imageAssetIdsByStory: { 'story-1': ['poster'] },
      mediaAssetIdsByStory: { 'story-1': ['clip'] },
      scenes: [scene('s1', [
        step('v1', 'video', { mode: 'play', layer: 'background', assetId: 'clip', posterAssetId: 'poster' }),
      ])],
    });

    const poster = gallery.images.find((item) => item.assetId === 'poster');
    expect(poster?.usage.enabled).toBe(1);
  });

  it('splits used and unused without overlap', () => {
    const gallery = build({
      mediaLibrary: [asset({ id: 'used' }), asset({ id: 'spare' })],
      imageAssetIdsByStory: { 'story-1': ['used', 'spare'] },
      scenes: [scene('s1', [step('b1', 'background', { assetId: 'used' })])],
    });

    const used = filterMediaItems(gallery.images, { kind: 'used' });
    const unused = filterMediaItems(gallery.images, { kind: 'unused' });
    expect(used.map((item) => item.assetId)).toEqual(['used']);
    expect(unused.map((item) => item.assetId)).toEqual(['spare']);
    expect(used.length + unused.length).toBe(gallery.counts.images);
  });

  it('never puts a plain background in a character filter', () => {
    const gallery = build({
      mediaLibrary: [asset({ id: 'bg' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      characters: [character('alice', [sprite('happy')])],
    });

    const alicesImages = filterMediaItems(gallery.images, { kind: 'character', characterId: 'alice' });
    expect(alicesImages.map((item) => item.name)).toEqual(['happy']);
  });

  it('lists a character with no sprites at zero', () => {
    const gallery = build({ characters: [character('ghost', [])] });
    expect(gallery.characterFilters).toEqual([
      { characterId: 'ghost', name: 'ghost', color: '#123456', avatarUri: undefined, count: 0 },
    ]);
  });

  it('prefers the default sprite for the filter avatar', () => {
    const gallery = build({
      characters: [character('alice', [sprite('first'), sprite('chosen')], { defaultSpriteId: 'chosen' })],
    });

    expect(gallery.characterFilters[0].avatarUri).toBe('file://chosen.png');
    expect(gallery.characterFilters[0].count).toBe(2);
  });

  it('keeps videos out of the image tab and honours story membership', () => {
    const gallery = build({
      mediaLibrary: [
        asset({ id: 'mine', type: 'video', uri: 'file://mine.mp4', durationSeconds: 12, size: 99 }),
        asset({ id: 'other-story', type: 'video', uri: 'file://other.mp4' }),
      ],
      mediaAssetIdsByStory: { 'story-1': ['mine'] },
    });

    expect(gallery.images).toEqual([]);
    expect(gallery.videos.map((item) => item.assetId)).toEqual(['mine']);
    expect(gallery.videos[0]).toMatchObject({ kind: 'video', durationSeconds: 12, sizeBytes: 99 });
  });

  it('sorts newest first', () => {
    const gallery = build({
      mediaLibrary: [asset({ id: 'old', addedAt: 10 }), asset({ id: 'new', addedAt: 20 })],
      imageAssetIdsByStory: { 'story-1': ['old', 'new'] },
    });

    expect(gallery.images.map((item) => item.assetId)).toEqual(['new', 'old']);
  });
});

describe('filterMediaItems', () => {
  const gallery = build({
    mediaLibrary: [asset({ id: 'a1', uri: 'file://room.png', name: 'room.png' })],
    imageAssetIdsByStory: { 'story-1': ['a1'] },
    characters: [character('alice', [sprite('happy', { name: 'Happy face', uri: 'file://alice.png' })])],
  });

  it('searches file name, character name and sprite name', () => {
    expect(filterMediaItems(gallery.images, { kind: 'all' }, 'room')).toHaveLength(1);
    expect(filterMediaItems(gallery.images, { kind: 'all' }, 'ALICE')).toHaveLength(1);
    expect(filterMediaItems(gallery.images, { kind: 'all' }, 'happy face')).toHaveLength(1);
    expect(filterMediaItems(gallery.images, { kind: 'all' }, 'nothing')).toHaveLength(0);
  });

  it('accepts the video filter shorthand', () => {
    expect(filterMediaItems(gallery.images, 'all')).toHaveLength(gallery.images.length);
  });
});

describe('groupMediaByDate', () => {
  const now = new Date('2026-08-24T12:00:00Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  function itemAt(id: string, addedAt: number) {
    return build({
      mediaLibrary: [asset({ id, addedAt })],
      imageAssetIdsByStory: { 'story-1': [id] },
    }).images[0];
  }

  it('splits today, this week and earlier', () => {
    const groups = groupMediaByDate(
      [itemAt('today', now), itemAt('week', now - 3 * dayMs), itemAt('old', now - 40 * dayMs)],
      now,
    );

    expect(groups.map((group) => group.label)).toEqual(['today', 'thisWeek', 'earlier']);
    expect(groups[0].items[0].assetId).toBe('today');
  });

  it('omits empty groups', () => {
    expect(groupMediaByDate([itemAt('today', now)], now).map((group) => group.label)).toEqual(['today']);
    expect(groupMediaByDate([], now)).toEqual([]);
  });

  it('groups a standalone sprite by its createdAt', () => {
    const gallery = build({
      characters: [character('alice', [sprite('happy', { createdAt: now })])],
    });

    expect(groupMediaByDate(gallery.images, now)[0].label).toBe('today');
  });
});

describe('canRemoveFromStory', () => {
  it('refuses a used file, an owned file, and a file with no assetId', () => {
    const used = build({
      mediaLibrary: [asset({ id: 'used' })],
      imageAssetIdsByStory: { 'story-1': ['used'] },
      scenes: [scene('s1', [step('b1', 'background', { assetId: 'used' })])],
    }).images[0];
    const disabledOnly = build({
      mediaLibrary: [asset({ id: 'off' })],
      imageAssetIdsByStory: { 'story-1': ['off'] },
      scenes: [scene('s1', [step('b1', 'background', { assetId: 'off' }, false)])],
    }).images[0];
    const owned = build({
      mediaLibrary: [asset({ id: 'a1', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['a1'] },
      characters: [character('alice', [sprite('happy', { uri: 'file://alice.png' })])],
    }).images[0];

    expect(canRemoveFromStory(used)).toBe(false);
    // A disabled block still holds the reference; re-enabling it would break.
    expect(canRemoveFromStory(disabledOnly)).toBe(false);
    expect(canRemoveFromStory(owned)).toBe(false);
  });

  it('allows an unused, unowned library file', () => {
    const spare = build({
      mediaLibrary: [asset({ id: 'spare' })],
      imageAssetIdsByStory: { 'story-1': ['spare'] },
    }).images[0];

    expect(canRemoveFromStory(spare)).toBe(true);
  });
});

describe('canDetachOwner', () => {
  const shared = () => build({
    mediaLibrary: [asset({ id: 'a1', uri: 'file://shared.png' })],
    imageAssetIdsByStory: { 'story-1': ['a1'] },
    characters: [
      character('alice', [sprite('happy', { uri: 'file://shared.png' })]),
      character('bob', [sprite('calm', { uri: 'file://shared.png' })]),
    ],
    scenes: [scene('s1', [
      step('c1', 'character', {
        characterId: 'alice',
        spriteId: 'happy',
        position: 'left',
        transition: 'instant',
        delay: 0,
        duration: null,
      }),
      step('b1', 'background', { assetId: 'a1' }),
    ])],
  }).images[0];

  // One file, one tile, two owners — and the reference names one of them. A
  // per-file gate would either strand Bob's sprite or let Alice's dangle.
  it('separates the owners of one file', () => {
    const item = shared();
    const alice = item.owners.find((owner) => owner.characterId === 'alice')!;
    const bob = item.owners.find((owner) => owner.characterId === 'bob')!;

    expect(alice.usage).toEqual({ enabled: 1, disabled: 0 });
    expect(bob.usage).toEqual({ enabled: 0, disabled: 0 });
    expect(canDetachOwner(alice)).toBe(false);
    expect(canDetachOwner(bob)).toBe(true);
  });

  // The file is a background in the same scene. That reference survives the
  // detach untouched, so it must not count against the sprite.
  it('ignores references to the file that do not name the sprite', () => {
    const item = shared();
    expect(item.usage.enabled).toBe(2);
    expect(canDetachOwner(item.owners.find((owner) => owner.characterId === 'bob')!)).toBe(true);
  });

  it('counts a disabled reference against the sprite', () => {
    const item = build({
      mediaLibrary: [asset({ id: 'a1', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['a1'] },
      characters: [character('alice', [sprite('happy', { uri: 'file://alice.png' })])],
      scenes: [scene('s1', [
        step('c1', 'character', {
          characterId: 'alice',
          spriteId: 'happy',
          position: 'left',
          transition: 'instant',
          delay: 0,
          duration: null,
        }, false),
      ])],
    }).images[0];

    // Re-enabling the block brings the reference back; the sprite has to exist.
    expect(item.owners[0].usage).toEqual({ enabled: 0, disabled: 1 });
    expect(canDetachOwner(item.owners[0])).toBe(false);
  });
});

describe('findOwnerInGallery', () => {
  const characterStep = step('c1', 'character', {
    characterId: 'alice',
    spriteId: 'happy',
    position: 'left',
    transition: 'instant',
    delay: 0,
    duration: null,
  });

  const input = (scenes: SceneRecord[]): StoryMediaGalleryInput => ({
    storyId: 'story-1',
    mediaLibrary: [asset({ id: 'a1', uri: 'file://alice.png' })],
    imageAssetIdsByStory: { 'story-1': ['a1'] },
    mediaAssetIdsByStory: {},
    characters: [character('alice', [sprite('happy', { uri: 'file://alice.png' })])],
    scenes,
  });

  // The point of the helper: the grid may have been built before the scene
  // that shows this sprite finished loading, so the answer has to come from
  // the state handed in now, not from the item the button was rendered with.
  it('answers from the state it is given', () => {
    const beforeScenesLoad = findOwnerInGallery(input([]), 'asset:a1', 'alice:happy');
    const afterScenesLoad = findOwnerInGallery(
      input([scene('s1', [characterStep])]),
      'asset:a1',
      'alice:happy',
    );

    expect(canDetachOwner(beforeScenesLoad!)).toBe(true);
    expect(canDetachOwner(afterScenesLoad!)).toBe(false);
  });

  it('returns nothing when the owner is gone', () => {
    expect(findOwnerInGallery(input([]), 'asset:a1', 'alice:missing')).toBeUndefined();
    expect(findOwnerInGallery(input([]), 'asset:nothing', 'alice:happy')).toBeUndefined();
  });
});

describe('audio in the gallery', () => {
  const track = (id: string, name = `${id}.mp3`) =>
    asset({ id, name, type: 'audio', uri: `file://${id}.mp3`, durationSeconds: 90 });

  const musicStep = (assetId: string, enabled = true) =>
    step(`music-${assetId}`, 'music', { mode: 'track', assetId }, enabled);
  const soundStep = (assetId: string, enabled = true) =>
    step(`sound-${assetId}`, 'sound', { mode: 'track', assetId }, enabled);

  it('lists the story audio separately from images and videos', () => {
    const gallery = build({
      mediaLibrary: [
        track('bgm'),
        asset({ id: 'bg' }),
        asset({ id: 'clip', type: 'video', uri: 'file://clip.mp4', name: 'clip.mp4' }),
      ],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      mediaAssetIdsByStory: { 'story-1': ['bgm', 'clip'] },
    });

    expect(gallery.audios.map((item) => item.assetId)).toEqual(['bgm']);
    expect(gallery.images.map((item) => item.assetId)).toEqual(['bg']);
    expect(gallery.videos.map((item) => item.assetId)).toEqual(['clip']);
    expect(gallery.counts).toMatchObject({ images: 1, videos: 1, audios: 1 });
  });

  // Membership is per story, and the media library is global — the same reason
  // the video list is filtered rather than taken whole.
  it('leaves out audio that belongs to another story', () => {
    const gallery = build({
      mediaLibrary: [track('ours'), track('theirs')],
      mediaAssetIdsByStory: { 'story-1': ['ours'], 'story-2': ['theirs'] },
    });

    expect(gallery.audios.map((item) => item.assetId)).toEqual(['ours']);
  });

  it('takes the category from the story audio library first', () => {
    const gallery = build({
      mediaLibrary: [track('rain', 'rain.mp3')],
      mediaAssetIdsByStory: { 'story-1': ['rain'] },
      // Nothing in the name or the scenes says "music"; the author does.
      audioLibrary: [{ id: 'rain', name: 'rain.mp3', uri: 'file://rain.mp3', type: 'music', createdAt: 1 }],
    });

    expect(gallery.audios[0].audioCategory).toBe('music');
  });

  it('falls back to how the scenes play it', () => {
    const gallery = build({
      mediaLibrary: [track('one'), track('two')],
      mediaAssetIdsByStory: { 'story-1': ['one', 'two'] },
      scenes: [scene('s1', [musicStep('one'), soundStep('two')])],
    });

    expect(gallery.audios.find((item) => item.assetId === 'one')?.audioCategory).toBe('music');
    expect(gallery.audios.find((item) => item.assetId === 'two')?.audioCategory).toBe('sound');
  });

  // A file can be both the theme and a one-shot sting. One answer has to win,
  // and the background track is the louder claim about what the file is.
  it('calls a file used in both roles music', () => {
    const gallery = build({
      mediaLibrary: [track('both')],
      mediaAssetIdsByStory: { 'story-1': ['both'] },
      scenes: [scene('s1', [soundStep('both'), musicStep('both')])],
    });

    expect(gallery.audios[0].audioCategory).toBe('music');
  });

  it('guesses from the file name only when nothing plays the file', () => {
    const gallery = build({
      mediaLibrary: [track('a', 'main-theme.mp3'), track('b', 'door-creak.mp3')],
      mediaAssetIdsByStory: { 'story-1': ['a', 'b'] },
    });

    expect(gallery.audios.find((item) => item.assetId === 'a')?.audioCategory).toBe('music');
    expect(gallery.audios.find((item) => item.assetId === 'b')?.audioCategory).toBe('sound');
  });

  // Before this, the gallery handed the usage report no audio at all, so every
  // music/sound reference in the story counted as broken and every track read
  // as unused.
  it('counts audio as used from music and sound references', () => {
    const gallery = build({
      mediaLibrary: [track('used-music'), track('used-sound'), track('spare')],
      mediaAssetIdsByStory: { 'story-1': ['used-music', 'used-sound', 'spare'] },
      scenes: [scene('s1', [musicStep('used-music'), soundStep('used-sound')], 'Opening')],
    });

    const byId = new Map(gallery.audios.map((item) => [item.assetId, item]));
    expect(byId.get('used-music')?.usage).toEqual({ enabled: 1, disabled: 0 });
    expect(byId.get('used-sound')?.usage).toEqual({ enabled: 1, disabled: 0 });
    expect(byId.get('spare')?.usage).toEqual({ enabled: 0, disabled: 0 });
    expect(gallery.counts.used).toBe(2);
    expect(byId.get('used-music')?.references[0]).toMatchObject({ sceneId: 's1', sceneName: 'Opening' });
  });

  it('counts a disabled step as usage, so the file stays undeletable', () => {
    const gallery = build({
      mediaLibrary: [track('bgm')],
      mediaAssetIdsByStory: { 'story-1': ['bgm'] },
      scenes: [scene('s1', [musicStep('bgm', false)])],
    });

    expect(gallery.audios[0].usage).toEqual({ enabled: 0, disabled: 1 });
    expect(canRemoveFromStory(gallery.audios[0])).toBe(false);
  });

  it('filters by category', () => {
    const gallery = build({
      mediaLibrary: [track('one'), track('two')],
      mediaAssetIdsByStory: { 'story-1': ['one', 'two'] },
      scenes: [scene('s1', [musicStep('one'), soundStep('two')])],
    });

    expect(filterMediaItems(gallery.audios, { kind: 'audioCategory', category: 'music' })
      .map((item) => item.assetId)).toEqual(['one']);
    expect(filterMediaItems(gallery.audios, { kind: 'audioCategory', category: 'sound' })
      .map((item) => item.assetId)).toEqual(['two']);
  });
});

describe('setAudioCategoryInLibrary', () => {
  const file = { assetId: 'bgm', uri: 'file://bgm.mp3', name: 'bgm.mp3', addedAt: 5 };

  it('records the answer for a file the library has never heard of', () => {
    const next = setAudioCategoryInLibrary([], file, 'music');

    expect(next).toEqual([expect.objectContaining({
      id: 'bgm',
      uri: 'file://bgm.mp3',
      name: 'bgm.mp3',
      type: 'music',
      createdAt: 5,
    })]);
  });

  it('rewrites an entry that says the other thing, and leaves the rest alone', () => {
    const library = [
      { id: 'bgm', name: 'bgm.mp3', uri: 'file://bgm.mp3', type: 'sfx' as const, createdAt: 1 },
      { id: 'other', name: 'other.mp3', uri: 'file://other.mp3', type: 'music' as const, createdAt: 1 },
    ];

    const next = setAudioCategoryInLibrary(library, file, 'music');

    expect(next[0]).toMatchObject({ id: 'bgm', type: 'music' });
    expect(next[1]).toBe(library[1]);
  });

  // `voice` and `ambient` both mean "sound" here; flattening them to `sfx`
  // would throw away a distinction the reader still uses.
  it('leaves a voice entry alone when told it is a sound', () => {
    const library = [{ id: 'bgm', name: 'bgm.mp3', uri: 'file://bgm.mp3', type: 'voice' as const, createdAt: 1 }];

    expect(setAudioCategoryInLibrary(library, file, 'sound')).toBe(library);
  });

  it('matches an entry by URI when the file has no asset id', () => {
    const library = [{ id: 'legacy', name: 'bgm.mp3', uri: 'file://bgm.mp3', type: 'sfx' as const, createdAt: 1 }];

    const next = setAudioCategoryInLibrary(library, { ...file, assetId: undefined }, 'music');

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: 'legacy', type: 'music' });
  });

  it('outranks both the scenes and the file name in the gallery', () => {
    const built = build({
      mediaLibrary: [asset({ id: 'bgm', name: 'main-theme.mp3', type: 'audio', uri: 'file://bgm.mp3' })],
      mediaAssetIdsByStory: { 'story-1': ['bgm'] },
      scenes: [scene('s1', [step('m', 'music', { mode: 'track', assetId: 'bgm' })])],
      audioLibrary: setAudioCategoryInLibrary(
        [],
        { assetId: 'bgm', uri: 'file://bgm.mp3', name: 'main-theme.mp3', addedAt: 1 },
        'sound',
      ),
    });

    expect(built.audios[0].audioCategory).toBe('sound');
  });
});
