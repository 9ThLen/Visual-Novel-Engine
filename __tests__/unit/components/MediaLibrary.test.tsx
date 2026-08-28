/**
 * Grid, filter rail and inspector, driven by real gallery items built from the
 * model rather than by hand — so the tests fail if the UI and
 * `buildStoryMediaGallery` ever disagree about what an item looks like.
 *
 * The screen itself is covered separately in MediaLibraryRoute.test.tsx; these
 * tests stay at the component level so a failure points at the UI rather than
 * at the store wiring.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MediaFilterRail, MediaTypeTabs, initialsOf, sameFilter } from '@/components/media-library/MediaFilters';
import { MediaGrid, buildGridRows, getGalleryColumns } from '@/components/media-library/MediaGrid';
import { MediaInspector } from '@/components/media-library/MediaInspector';
import { acquireResolvedAssetUri } from '@/lib/asset-resolver';
import {
  resetThumbnailsForTests,
  setThumbnailGeneratorForTests,
} from '@/lib/thumbnails';
import { Colors } from '@/lib/_core/theme';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import {
  buildStoryMediaGallery,
  filterMediaItems,
  type StoryMediaGalleryInput,
  type StoryMediaItem,
} from '@/lib/story-media-gallery';

const colors = Colors.light;
const NOW = new Date('2026-08-24T12:00:00Z').getTime();

function asset(overrides: Partial<LibraryAsset> & { id: string }): LibraryAsset {
  return {
    type: 'image',
    uri: `file://${overrides.id}.png`,
    name: `${overrides.id}.png`,
    addedAt: NOW,
    ...overrides,
  };
}

function scene(timeline: TimelineStep[]): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Opening',
    description: '',
    tags: [],
    timeline,
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function gallery(overrides: Partial<StoryMediaGalleryInput> = {}) {
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

const alice = {
  id: 'alice',
  name: 'Alice',
  color: '#ff0000',
  createdAt: 1,
  sprites: [{ id: 'happy', name: 'Happy', uri: 'file://alice.png', createdAt: NOW }],
};

function renderGrid(items: StoryMediaItem[], overrides: Record<string, unknown> = {}) {
  const onSelect = vi.fn();
  render(
    <MediaGrid
      items={items}
      colors={colors}
      selectedKey={null}
      grouped={false}
      now={NOW}
      emptyLabel="No images in this story yet."
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return onSelect;
}

describe('grid layout maths', () => {
  it('scales columns from phone to desktop', () => {
    expect(getGalleryColumns(390)).toBe(3);
    expect(getGalleryColumns(900)).toBe(5);
    expect(getGalleryColumns(1200)).toBe(6);
    expect(getGalleryColumns(1600)).toBe(8);
  });

  // FlatList cannot do numColumns and sections at once, so rows are pre-chunked
  // and date headers become ordinary list entries.
  it('chunks rows and adds date headers only when grouped', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ key: `k${index}`, addedAt: NOW })) as StoryMediaItem[];

    const flat = buildGridRows(items, 3, false, NOW);
    expect(flat.map((row) => row.type)).toEqual(['row', 'row']);
    expect(flat[0].type === 'row' && flat[0].items).toHaveLength(3);
    expect(flat[1].type === 'row' && flat[1].items).toHaveLength(2);

    expect(buildGridRows(items, 3, true, NOW)[0].type).toBe('header');
  });

  it('falls back to initials for a character with no sprite', () => {
    expect(initialsOf('Alice Liddell')).toBe('AL');
    expect(initialsOf('Bob')).toBe('B');
    expect(initialsOf('   ')).toBe('?');
  });

  it('compares character filters by id', () => {
    expect(sameFilter({ kind: 'character', characterId: 'a' }, { kind: 'character', characterId: 'a' })).toBe(true);
    expect(sameFilter({ kind: 'character', characterId: 'a' }, { kind: 'character', characterId: 'b' })).toBe(false);
    expect(sameFilter({ kind: 'all' }, { kind: 'used' })).toBe(false);
  });
});

describe('media grid', () => {
  it('labels a plain image and one owned by a character', () => {
    const built = gallery({
      mediaLibrary: [asset({ id: 'bg' }), asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['bg', 'sprite'] },
      characters: [alice],
    });

    renderGrid(built.images);

    expect(screen.getByRole('button', { name: 'Image, bg.png' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Image, sprite.png, Alice' })).toBeTruthy();
  });

  it('shows only the character images under a character filter', () => {
    const built = gallery({
      mediaLibrary: [asset({ id: 'bg' }), asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['bg', 'sprite'] },
      characters: [alice],
    });

    renderGrid(filterMediaItems(built.images, { kind: 'character', characterId: 'alice' }));

    expect(screen.getByRole('button', { name: 'Image, sprite.png, Alice' })).toBeTruthy();
    // A background has no owner, so it must never surface under a character.
    expect(screen.queryByRole('button', { name: 'Image, bg.png' })).toBeNull();
  });

  // An .mp4 handed to <Image> renders an empty square, so a clip gets a real
  // placeholder rather than a broken preview.
  it('renders a named placeholder for a video instead of an image', () => {
    const built = gallery({
      mediaLibrary: [asset({ id: 'clip', type: 'video', uri: 'file://clip.mp4', name: 'intro.mp4' })],
      mediaAssetIdsByStory: { 'story-1': ['clip'] },
    });

    renderGrid(built.videos);

    expect(screen.getByText('intro.mp4')).toBeTruthy();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('labels a video and shows its duration only when known', () => {
    const built = gallery({
      mediaLibrary: [
        asset({ id: 'timed', type: 'video', uri: 'file://timed.mp4', name: 'timed.mp4', durationSeconds: 75 }),
        asset({ id: 'untimed', type: 'video', uri: 'file://untimed.mp4', name: 'untimed.mp4' }),
      ],
      mediaAssetIdsByStory: { 'story-1': ['timed', 'untimed'] },
    });

    renderGrid(built.videos);

    expect(screen.getByRole('button', { name: 'Video, timed.mp4' })).toBeTruthy();
    expect(screen.getByText('1:15')).toBeTruthy();
    expect(screen.queryByText('0:00')).toBeNull();
  });

  // The screen picks the label; the grid must show whatever it was handed, so a
  // usage filter can explain itself instead of claiming the story is empty.
  it('shows the empty label it was given', () => {
    renderGrid([], { emptyLabel: 'Nothing here is used in a scene yet.' });
    expect(screen.getByText('Nothing here is used in a scene yet.')).toBeTruthy();
  });

  it('reports the tapped item and shows the empty label for nothing', () => {
    const built = gallery({
      mediaLibrary: [asset({ id: 'bg' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
    });
    const onSelect = renderGrid(built.images);

    fireEvent.click(screen.getByRole('button', { name: 'Image, bg.png' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'bg' }));

    renderGrid([]);
    expect(screen.getByText('No images in this story yet.')).toBeTruthy();
  });
});

describe('filter rail and tabs', () => {
  it('shows every character, including one with no images yet', () => {
    const built = gallery({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characters: [alice, { id: 'ghost', name: 'Ghost', createdAt: 1, sprites: [] }],
    });
    const onChange = vi.fn();

    render(
      <MediaFilterRail
        colors={colors}
        filter={{ kind: 'all' }}
        counts={{ all: 1, used: 0, unused: 1 }}
        characters={built.characterFilters}
        usageReady
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('button', { name: /^Alice/ })).toBeTruthy();
    // Picking a character with no sprites is how the author gives them a first one.
    expect(screen.getByRole('button', { name: /^Ghost/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Alice/ }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'character', characterId: 'alice' });
  });

  // "Used" and "Unused" are not two halves of the library while the scenes are
  // still being read — everything lands in "unused" — so neither is offered.
  it('withholds the usage filters until usage is known', () => {
    const onChange = vi.fn();
    render(
      <MediaFilterRail
        colors={colors}
        filter={{ kind: 'all' }}
        counts={{ all: 6, used: 0, unused: 6 }}
        characters={[]}
        usageReady={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Used' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unused' }));

    expect(onChange).not.toHaveBeenCalled();
    // And the counts they would have shown are not asserted either.
    expect(screen.queryByText('6')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  // A ScrollView grows by default, so left alone the rail would take half the
  // column from the grid and stretch every chip down to the bottom with it.
  it('keeps the rail one row tall instead of growing into the grid', () => {
    render(
      <MediaFilterRail
        colors={colors}
        filter={{ kind: 'all' }}
        counts={{ all: 6, used: 2, unused: 4 }}
        characters={[]}
        usageReady
        onChange={vi.fn()}
      />,
    );

    // The ScrollView mock flattens the scroll style and the content container
    // style onto the one element holding the chips.
    const rail = screen.getByRole('button', { name: 'All' }).parentElement as HTMLElement;

    expect(rail.style.flexGrow).toBe('0');
    expect(rail.style.alignItems).toBe('center');
  });

  it('switches between the image, video and sound tabs', () => {
    const onChange = vi.fn();
    render(
      <MediaTypeTabs colors={colors} kind="image" counts={{ images: 2, videos: 1, audios: 3 }} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Videos/ }));
    expect(onChange).toHaveBeenCalledWith('video');

    fireEvent.click(screen.getByRole('tab', { name: /Sounds/ }));
    expect(onChange).toHaveBeenCalledWith('audio');
    expect(screen.getByRole('tab', { name: /Sounds\s+3/ })).toBeTruthy();
  });

  // Characters mean nothing to a sound file; music and sound are the two roles
  // a timeline actually plays one in.
  it('offers the two audio categories in place of characters', () => {
    const onChange = vi.fn();
    render(
      <MediaFilterRail
        colors={colors}
        filter={{ kind: 'all' }}
        counts={{ all: 4, used: 1, unused: 3 }}
        characters={[]}
        audioCategories={[{ category: 'music', count: 1 }, { category: 'sound', count: 3 }]}
        usageReady
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Music' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'audioCategory', category: 'music' });

    fireEvent.click(screen.getByRole('button', { name: 'Sounds' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'audioCategory', category: 'sound' });
  });

  it('compares category filters by category', () => {
    expect(sameFilter(
      { kind: 'audioCategory', category: 'music' },
      { kind: 'audioCategory', category: 'music' },
    )).toBe(true);
    expect(sameFilter(
      { kind: 'audioCategory', category: 'music' },
      { kind: 'audioCategory', category: 'sound' },
    )).toBe(false);
  });
});

// A tile is ~150px; the bundled backgrounds are 4000px wide. What an image
// costs on screen is its decoded bitmap, so the grid has to ask for a small one.
describe('grid thumbnails', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetThumbnailsForTests();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:thumbnail');
    globalThis.URL.revokeObjectURL = vi.fn();
    globalThis.fetch = vi.fn(async () => new Response(new Blob(['x']))) as unknown as typeof fetch;
  });

  afterEach(() => {
    resetThumbnailsForTests();
    globalThis.fetch = originalFetch;
  });

  const tile = () => gallery({
    mediaLibrary: [asset({ id: 'bg', uri: 'file://bg.png' })],
    imageAssetIdsByStory: { 'story-1': ['bg'] },
  }).images[0];

  it('renders the thumbnail rather than the original file', async () => {
    setThumbnailGeneratorForTests(async () => new Blob(['small']));
    renderGrid([tile()]);

    await waitFor(() =>
      expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:thumbnail'));
  });

  it('falls back to the original when no thumbnail can be made', async () => {
    // What happens on every platform without a canvas, and for images already
    // small enough to be worth leaving alone.
    setThumbnailGeneratorForTests(async () => null);
    renderGrid([tile()]);

    await waitFor(() =>
      expect(document.querySelector('img')?.getAttribute('src')).toBe('file://bg.png'));
  });
});

describe('media inspector', () => {
  function renderInspector(item: StoryMediaItem, overrides: Record<string, unknown> = {}) {
    const handlers = {
      onClose: vi.fn(),
      onOpenScene: vi.fn(),
      onRemoveBackground: vi.fn(),
      onRemoveFromStory: vi.fn(),
      onAttachToCharacter: vi.fn(),
      onDetachFromCharacter: vi.fn(),
      onMakeDefaultSprite: vi.fn(),
    };
    render(
      <MediaInspector
        item={item}
        colors={colors}
        asSheet={false}
        canRemoveBackground={false}
        removingBackground={false}
        characters={[]}
        usageState="ready"
        {...handlers}
        {...overrides}
      />,
    );
    return handlers;
  }

  const usedImage = () => gallery({
    mediaLibrary: [asset({ id: 'bg' })],
    imageAssetIdsByStory: { 'story-1': ['bg'] },
    scenes: [scene([
      { id: 'step-1', blockType: 'background', enabled: true, data: { assetId: 'bg' } } as TimelineStep,
    ])],
  }).images[0];

  it('blocks removal of a used file and offers its scenes instead', () => {
    const handlers = renderInspector(usedImage());

    expect(screen.getByText(/Used in 1 scenes/)).toBeTruthy();
    expect(screen.getByText(/used in the scenes below/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove imported file' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open scene: Opening' }));
    expect(handlers.onOpenScene).toHaveBeenCalledWith('scene-1');
  });

  // Two steps in one scene are two references but one place to visit; counting
  // references would claim two scenes and list the same scene twice.
  it('counts and lists scenes, not references', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'bg', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      characters: [alice],
      scenes: [scene([
        { id: 'step-1', blockType: 'background', enabled: true, data: { assetId: 'bg' } } as TimelineStep,
        { id: 'step-2', blockType: 'character', enabled: true, data: { characterId: 'alice', spriteId: 'happy', position: 'left', transition: 'instant', delay: 0, duration: null } } as TimelineStep,
      ])],
    }).images[0];

    expect(item.references).toHaveLength(2);
    renderInspector(item);

    expect(screen.getByText(/Used in 1 scenes/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Open scene: Opening' })).toHaveLength(1);
  });

  it('blocks removal while a disabled reference still points at the file', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'bg' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      scenes: [scene([
        { id: 'step-1', blockType: 'background', enabled: false, data: { assetId: 'bg' } } as TimelineStep,
      ])],
    }).images[0];

    renderInspector(item);

    // Re-enabling the block would break the reference, so it still counts.
    expect(screen.queryByRole('button', { name: 'Remove imported file' })).toBeNull();
    expect(screen.getByText(/1/)).toBeTruthy();
  });

  it('explains that a character-owned file is detached through its character', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characters: [alice],
    }).images[0];

    renderInspector(item);

    expect(screen.getByText(/belongs to a character/)).toBeTruthy();
    expect(screen.getByText('Alice · Happy')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove imported file' })).toBeNull();
    // And the way to detach it is right there, since nothing references it.
    expect(screen.getByRole('button', { name: 'Remove from Alice' })).toBeTruthy();
  });

  it('explains that a sprite outside the library has no story membership', () => {
    const item = gallery({ characters: [alice] }).images[0];

    renderInspector(item);

    expect(screen.getByText(/lives on a character/)).toBeTruthy();
  });

  it('allows removal of an unused, unowned file', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'spare' })],
      imageAssetIdsByStory: { 'story-1': ['spare'] },
    }).images[0];
    const handlers = renderInspector(item);

    expect(screen.getByText('Not used in any scene')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove imported file' }));
    expect(handlers.onRemoveFromStory).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'spare' }));
  });

  // Resolution succeeding says nothing about decoding. Without watching the
  // player a broken clip is a silent black rectangle with no way back.
  it('offers a retry when the player reports a playback failure', async () => {
    const item = gallery({
      mediaLibrary: [asset({
        id: 'video-decode-error',
        type: 'video',
        uri: 'file://broken.mp4',
        name: 'broken.mp4',
      })],
      mediaAssetIdsByStory: { 'story-1': ['video-decode-error'] },
    }).videos[0];

    const acquire = acquireResolvedAssetUri as unknown as ReturnType<typeof vi.fn>;
    acquire.mockClear();
    renderInspector(item);

    await waitFor(() => expect(screen.getByText('This video could not be opened.')).toBeTruthy());
    expect(acquire).toHaveBeenCalledTimes(1);

    // Retry has to re-run the resolve: a revoked object URL cannot be recovered
    // by replaying the value the player already has.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(acquire).toHaveBeenCalledTimes(2));
    expect(acquire).toHaveBeenLastCalledWith('video-decode-error');
  });

  it('offers background removal only where the platform supports it', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'spare' })],
      imageAssetIdsByStory: { 'story-1': ['spare'] },
    }).images[0];

    renderInspector(item, { canRemoveBackground: true });
    expect(screen.getByRole('button', { name: 'Remove background' })).toBeTruthy();
  });

  const aliceFilter = { characterId: 'alice', name: 'Alice', color: '#ff0000', count: 0 };

  it('attaches a file to the character the author picks', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'spare' })],
      imageAssetIdsByStory: { 'story-1': ['spare'] },
    }).images[0];
    const handlers = renderInspector(item, { characters: [aliceFilter] });

    // The picker is closed until asked for: its rows are one-tap writes.
    expect(screen.queryByRole('button', { name: 'Add to Alice' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add to character…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Alice' }));

    expect(handlers.onAttachToCharacter).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'spare' }),
      'alice',
    );
  });

  // Attaching twice would give one character two sprites for one file, and the
  // second is indistinguishable from the first everywhere but the timeline.
  it('leaves out a character that already owns the file', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characters: [alice],
    }).images[0];
    renderInspector(item, { characters: [aliceFilter] });

    fireEvent.click(screen.getByRole('button', { name: 'Add to character…' }));

    expect(screen.getByText('Every character already has this image.')).toBeTruthy();
  });

  it('never offers to attach a video', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'clip', type: 'video', uri: 'file://clip.mp4', name: 'clip.mp4' })],
      mediaAssetIdsByStory: { 'story-1': ['clip'] },
    }).videos[0];

    renderInspector(item, { characters: [aliceFilter] });

    expect(screen.queryByRole('button', { name: 'Add to character…' })).toBeNull();
  });

  // A dangling `${characterId}:${spriteId}` is permanent: unlike story
  // membership, nothing re-derives a sprite a scene still names.
  it('refuses to detach a sprite a scene still shows', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characters: [alice],
      scenes: [scene([
        { id: 'step-1', blockType: 'character', enabled: true, data: { characterId: 'alice', spriteId: 'happy', position: 'left', transition: 'instant', delay: 0, duration: null } } as TimelineStep,
      ])],
    }).images[0];

    const handlers = renderInspector(item, { characters: [aliceFilter] });

    expect(screen.queryByRole('button', { name: 'Remove from Alice' })).toBeNull();
    expect(screen.getByText(/Shown as Alice in 1 scenes/)).toBeTruthy();
    expect(handlers.onDetachFromCharacter).not.toHaveBeenCalled();
  });

  // The file is a background in a scene, but no step names Alice's sprite:
  // detaching it breaks nothing, and the file stays in the story regardless.
  it('detaches a sprite whose own references are zero even when the file is used', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'bg', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      characters: [alice],
      scenes: [scene([
        { id: 'step-1', blockType: 'background', enabled: true, data: { assetId: 'bg' } } as TimelineStep,
      ])],
    }).images[0];

    const handlers = renderInspector(item, { characters: [aliceFilter] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Alice' }));

    expect(handlers.onDetachFromCharacter).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'bg' }),
      expect.objectContaining({ characterId: 'alice', spriteId: 'happy' }),
    );
  });

  // Everything looks unreferenced while the scenes are still loading, and a
  // detach taken on that basis is permanent: no migration restores a sprite.
  it('offers nothing destructive until the scenes have loaded', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characters: [alice],
    }).images[0];

    renderInspector(item, { characters: [aliceFilter], usageState: 'pending' });

    expect(screen.queryByRole('button', { name: 'Remove from Alice' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove imported file' })).toBeNull();
    expect(screen.getAllByText('Checking where this file is used…').length).toBeGreaterThan(0);
    // And it must not claim the file is unused while it does not know.
    expect(screen.queryByText('Not used in any scene')).toBeNull();
  });

  const twoSpriteAlice = {
    ...alice,
    defaultSpriteId: 'happy',
    sprites: [
      { id: 'happy', name: 'Happy', uri: 'file://alice.png', createdAt: NOW },
      { id: 'sad', name: 'Sad', uri: 'file://alice-sad.png', createdAt: NOW },
    ],
  };

  it('offers to move the default onto a sprite that is not it', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'sad', uri: 'file://alice-sad.png' })],
      imageAssetIdsByStory: { 'story-1': ['sad'] },
      characters: [twoSpriteAlice],
    }).images[0];
    const handlers = renderInspector(item, { characters: [aliceFilter] });

    fireEvent.click(screen.getByRole('button', { name: 'Make default for Alice' }));

    expect(handlers.onMakeDefaultSprite).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'sad' }),
      expect.objectContaining({ spriteId: 'sad' }),
    );
  });

  it('marks the sprite that already is the default instead', () => {
    const item = gallery({
      mediaLibrary: [asset({ id: 'happy', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['happy'] },
      characters: [twoSpriteAlice],
    }).images[0];

    renderInspector(item, { characters: [aliceFilter] });

    expect(screen.getByText('Default')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make default for Alice' })).toBeNull();
  });

  it('names the scene the author came from as the current one', () => {
    const handlers = renderInspector(usedImage(), { currentSceneId: 'scene-1' });

    fireEvent.click(screen.getByRole('button', { name: 'Open current scene: Opening' }));
    expect(handlers.onOpenScene).toHaveBeenCalledWith('scene-1');
  });
});
