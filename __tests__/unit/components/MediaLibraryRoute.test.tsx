/**
 * The media library route, wired to the store the harness substitutes globally.
 *
 * The component tests next door drive the grid and inspector with props; this
 * one covers the seam between them — the screen's store reads, its filter
 * state, and the actions it dispatches back. It is not a test of the real
 * Zustand store, which the harness replaces for every suite.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StoryGalleryRoute from '@/app/story-gallery';
import type { LibraryAsset } from '@/lib/media-library-service';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { useAppStore } from '@/stores/use-app-store';
// Test-only helpers come from the mock path: the alias applies at runtime, but
// the real modules have no such export for tsc to find.
import { getRouterForTests, setLocalSearchParamsForTests } from '../../../__mocks__/expo-router';
import { mockAudioPlayers, resetMockAudioPlayers } from '../../../__mocks__/expo-audio';

function asset(overrides: Partial<LibraryAsset> & { id: string }): LibraryAsset {
  return {
    type: 'image',
    uri: `file://${overrides.id}.png`,
    name: `${overrides.id}.png`,
    addedAt: Date.now(),
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

type StoreSeed = Record<string, unknown>;

function seedStore(overrides: StoreSeed = {}) {
  const seed: StoreSeed = {
    storiesMetadata: [{ id: 'story-1', title: 'My story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 1 }],
    sceneRecordsByStory: {},
    mediaLibrary: [],
    imageAssetIdsByStory: {},
    mediaAssetIdsByStory: {},
    characterLibraries: {},
    // Seeded explicitly, or a story's audio library leaks into the next test:
    // the harness store merges what it is given rather than replacing it.
    audioLibraries: {},
    hydrateSceneRecordsForStory: vi.fn(async () => {}),
    addImageAssetToStory: vi.fn(),
    addMediaAssetToStory: vi.fn(),
    removeImageAssetFromStory: vi.fn(),
    removeMediaAssetFromStory: vi.fn(),
    setCharacterLibrary: vi.fn(),
    setAudioLibrary: vi.fn(),
    ...overrides,
  };
  (useAppStore as unknown as { setState: (value: StoreSeed) => void }).setState(seed);
  return seed;
}

const alice = {
  id: 'alice',
  name: 'Alice',
  color: '#ff0000',
  createdAt: 1,
  sprites: [{ id: 'happy', name: 'Happy', uri: 'file://alice.png', createdAt: 1 }],
};

describe('media library route', () => {
  beforeEach(() => {
    setLocalSearchParamsForTests({ storyId: 'story-1' });
    getRouterForTests().push.mockClear();
    document.querySelectorAll('input[type="file"]').forEach((element) => element.remove());
    resetMockAudioPlayers();
  });

  afterEach(() => {
    setLocalSearchParamsForTests({});
  });

  it('shows the story name and its images', () => {
    seedStore({
      mediaLibrary: [asset({ id: 'bg' }), asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['bg', 'sprite'] },
      characterLibraries: { 'story-1': [alice] },
    });

    render(<StoryGalleryRoute />);

    expect(screen.getByText('Media library')).toBeTruthy();
    expect(screen.getByText('My story')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Image, bg.png' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Image, sprite.png, Alice' })).toBeTruthy();
  });

  it('narrows the grid to one character and back', () => {
    seedStore({
      mediaLibrary: [asset({ id: 'bg' }), asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['bg', 'sprite'] },
      characterLibraries: { 'story-1': [alice] },
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }));

    expect(screen.getByRole('button', { name: 'Image, sprite.png, Alice' })).toBeTruthy();
    // A background has no owner, so it must never surface under a character.
    expect(screen.queryByRole('button', { name: 'Image, bg.png' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'Image, bg.png' })).toBeTruthy();
  });

  it('keeps videos out of the image tab', () => {
    seedStore({
      mediaLibrary: [asset({ id: 'bg' }), asset({ id: 'clip', type: 'video', uri: 'file://clip.mp4', name: 'clip.mp4' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      mediaAssetIdsByStory: { 'story-1': ['clip'] },
    });

    render(<StoryGalleryRoute />);
    expect(screen.queryByRole('button', { name: 'Video, clip.mp4' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Videos/ }));

    expect(screen.getByRole('button', { name: 'Video, clip.mp4' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Image, bg.png' })).toBeNull();
  });

  it('searches across file, character and sprite names', () => {
    seedStore({
      mediaLibrary: [asset({ id: 'room' }), asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['room', 'sprite'] },
      characterLibraries: { 'story-1': [alice] },
    });

    render(<StoryGalleryRoute />);
    const search = screen.getByPlaceholderText('Search by file, character or sprite');

    fireEvent.change(search, { target: { value: 'room' } });
    expect(screen.getByRole('button', { name: 'Image, room.png' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sprite\.png/ })).toBeNull();

    fireEvent.change(search, { target: { value: 'alice' } });
    expect(screen.getByRole('button', { name: 'Image, sprite.png, Alice' })).toBeTruthy();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('Nothing matches “zzz”.')).toBeTruthy();
  });

  // Each empty state has to say why it is empty; claiming the story has no
  // images when six are simply unused reads as a broken library.
  it('explains an empty usage filter without denying the images exist', async () => {
    seedStore({
      mediaLibrary: [asset({ id: 'bg' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      // The story's one scene, so the usage filters are answerable at all.
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
    });

    render(<StoryGalleryRoute />);
    // The usage filters stay shut until the scene load resolves.
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Used' }));

    expect(screen.getByText('Nothing here is used in a scene yet.')).toBeTruthy();
  });

  // Ownership is additive: the character gets a sprite of its own pointing at
  // the same file, and the scenes are not touched.
  it('attaches an image to a character without touching the scenes', async () => {
    const setCharacterLibrary = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'bg' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      characterLibraries: { 'story-1': [{ ...alice, sprites: [] }] },
      // The story's one scene, loaded: usage is knowable, so the inspector is
      // in its normal state rather than behind the loading gate.
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      setCharacterLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, bg.png' }));
    await waitFor(() => expect(screen.getByText('Not used in any scene')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Add to character…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Alice' }));

    expect(setCharacterLibrary).toHaveBeenCalledTimes(1);
    const [storyId, characters] = setCharacterLibrary.mock.calls[0];
    expect(storyId).toBe('story-1');
    expect(characters[0].sprites).toEqual([
      expect.objectContaining({ name: 'bg', uri: 'bg' }),
    ]);
    // The reference is the asset id, which outlives the URI.
    expect(characters[0].sprites[0]).not.toHaveProperty('assetUri');
  });

  it('detaches a sprite through the store', async () => {
    const setCharacterLibrary = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characterLibraries: { 'story-1': [alice] },
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      setCharacterLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sprite.png, Alice' }));
    await waitFor(() => expect(screen.getByText('Alice · Happy')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Remove from Alice' }));

    expect(setCharacterLibrary).toHaveBeenCalledWith('story-1', [
      expect.objectContaining({ id: 'alice', sprites: [] }),
    ]);
  });

  // The library is opened from a scene and has to lead back to it. There is no
  // fallback to "some scene of this story": landing the author in a scene they
  // were not editing is worse than not offering the way back at all.
  const characterStep = {
    id: 'step-1',
    blockType: 'character',
    enabled: true,
    data: { characterId: 'alice', spriteId: 'happy', position: 'left', transition: 'instant', delay: 0, duration: null },
  } as TimelineStep;

  function seedDeferredHydration(setCharacterLibrary: ReturnType<typeof vi.fn>) {
    let finish!: () => void;
    const loading = new Promise<void>((resolve) => { finish = () => resolve(); });
    seedStore({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characterLibraries: { 'story-1': [alice] },
      hydrateSceneRecordsForStory: vi.fn(() => loading),
      setCharacterLibrary,
    });
    return { finish };
  }

  const arriveWithScenes = (timeline: TimelineStep[]) => {
    (useAppStore as unknown as { setState: (value: StoreSeed) => void }).setState({
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene(timeline) } },
    });
  };

  // Scene records arrive asynchronously. Until they do, every sprite looks
  // unreferenced — and a detach taken on that basis cannot be undone, because
  // no migration restores a sprite the way it restores story membership.
  it('offers no detach until the scenes have loaded, and then refuses a used sprite', async () => {
    const setCharacterLibrary = vi.fn();
    const { finish } = seedDeferredHydration(setCharacterLibrary);

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sprite.png, Alice' }));
    await waitFor(() => expect(screen.getByText('Alice · Happy')).toBeTruthy());

    expect(screen.queryByRole('button', { name: 'Remove from Alice' })).toBeNull();
    expect(screen.getAllByText('Checking where this file is used…').length).toBeGreaterThan(0);

    // The scene that shows the sprite lands.
    await act(async () => { arriveWithScenes([characterStep]); finish(); });

    await waitFor(() => expect(screen.getByText(/Shown as Alice in 1 scenes/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Remove from Alice' })).toBeNull();
    expect(setCharacterLibrary).not.toHaveBeenCalled();
  });

  it('detaches once the loaded scenes turn out not to name the sprite', async () => {
    const setCharacterLibrary = vi.fn();
    const { finish } = seedDeferredHydration(setCharacterLibrary);

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sprite.png, Alice' }));
    await waitFor(() => expect(screen.getByText('Alice · Happy')).toBeTruthy());

    // A scene that uses the file as a background — which detaching cannot break.
    await act(async () => {
      arriveWithScenes([
        { id: 'step-1', blockType: 'background', enabled: true, data: { assetId: 'sprite' } } as TimelineStep,
      ]);
      finish();
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Remove from Alice' }));

    expect(setCharacterLibrary).toHaveBeenCalledWith('story-1', [
      expect.objectContaining({ id: 'alice', sprites: [] }),
    ]);
  });

  // A load that finished but produced nothing is not the same as a story with
  // no scenes: broken storage looks exactly like an unused library.
  it('does not trust an empty load while the story claims scenes', async () => {
    seedStore({
      storiesMetadata: [{ id: 'story-1', title: 'My story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 4 }],
      mediaLibrary: [asset({ id: 'spare' })],
      imageAssetIdsByStory: { 'story-1': ['spare'] },
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, spare.png' }));

    await waitFor(() => expect(screen.getAllByText('Could not check where this file is used.').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Remove imported file' })).toBeNull();
  });

  // The reader loads a window of scenes and the full load marks the story
  // hydrated even when storage returned nothing, so "some scenes are in memory"
  // is not "all of them are". The other nine could each name this sprite.
  it('does not mistake a partial load for a complete one', async () => {
    const setCharacterLibrary = vi.fn();
    seedStore({
      storiesMetadata: [{ id: 'story-1', title: 'My story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 4 }],
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characterLibraries: { 'story-1': [alice] },
      // One scene of four, and not one that mentions the sprite.
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      setCharacterLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sprite.png, Alice' }));
    await waitFor(() => expect(screen.getByText('Alice · Happy')).toBeTruthy());

    expect(screen.queryByRole('button', { name: 'Remove from Alice' })).toBeNull();
    expect(setCharacterLibrary).not.toHaveBeenCalled();
  });

  it('says nothing about usage while the story is only partly in memory', async () => {
    seedStore({
      storiesMetadata: [{ id: 'story-1', title: 'My story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 4 }],
      mediaLibrary: [asset({ id: 'spare' })],
      imageAssetIdsByStory: { 'story-1': ['spare'] },
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
    });

    render(<StoryGalleryRoute />);

    // The usage filters would claim everything is unused; they are withheld.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Used' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Used' }));
    expect(screen.getByRole('button', { name: 'Image, spare.png' })).toBeTruthy();
  });

  // The write is built from the store as it is at that moment, not from the
  // snapshot the button was rendered with. Anything that changed the library in
  // between — the editor saving, an AI rollback — would otherwise be undone by
  // this one action.
  it('writes from the library as it stands, not as it was rendered', async () => {
    const setCharacterLibrary = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characterLibraries: { 'story-1': [alice] },
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      setCharacterLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sprite.png, Alice' }));
    await waitFor(() => expect(screen.getByText('Alice · Happy')).toBeTruthy());

    // Somewhere else, Alice gains a second sprite.
    await act(async () => {
      (useAppStore as unknown as { setState: (value: StoreSeed) => void }).setState({
        characterLibraries: {
          'story-1': [{
            ...alice,
            sprites: [...alice.sprites, { id: 'sad', name: 'Sad', uri: 'file://alice-sad.png', createdAt: 2 }],
          }],
        },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove from Alice' }));

    expect(setCharacterLibrary).toHaveBeenCalledWith('story-1', [
      expect.objectContaining({
        id: 'alice',
        sprites: [expect.objectContaining({ id: 'sad' })],
      }),
    ]);
  });

  // The gate closes the wide window; this is the narrow one it cannot close —
  // the store changing between the render that drew the button and the tap that
  // uses it. Both updates happen inside one act(), so the handler runs against
  // the new store while the UI is still the old one.
  it('refuses the detach when the sprite became used after the button was drawn', async () => {
    const setCharacterLibrary = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characterLibraries: { 'story-1': [alice] },
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      setCharacterLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sprite.png, Alice' }));
    await waitFor(() => expect(screen.getByText('Alice · Happy')).toBeTruthy());
    const detach = screen.getByRole('button', { name: 'Remove from Alice' });

    act(() => {
      arriveWithScenes([characterStep]);
      detach.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setCharacterLibrary).not.toHaveBeenCalled();
  });

  // Mirrors the detach case: these writes replace the whole library too, so a
  // sprite that arrived after the render must survive them.
  it('attaches from the library as it stands, not as it was rendered', async () => {
    const setCharacterLibrary = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'bg' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      characterLibraries: { 'story-1': [{ ...alice, sprites: [] }] },
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      setCharacterLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, bg.png' }));
    await waitFor(() => expect(screen.getByText('Not used in any scene')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Add to character…' }));

    await act(async () => {
      (useAppStore as unknown as { setState: (value: StoreSeed) => void }).setState({
        characterLibraries: {
          'story-1': [{ ...alice, sprites: [{ id: 'sad', name: 'Sad', uri: 'file://alice-sad.png', createdAt: 2 }] }],
        },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add to Alice' }));

    const [, characters] = setCharacterLibrary.mock.calls[0];
    expect(characters[0].sprites.map((sprite: { id: string }) => sprite.id)).toEqual(['sad', expect.any(String)]);
  });

  it('moves the default on the library as it stands, not as it was rendered', async () => {
    const setCharacterLibrary = vi.fn();
    const twoSprites = {
      ...alice,
      defaultSpriteId: 'happy',
      sprites: [
        { id: 'happy', name: 'Happy', uri: 'file://alice.png', createdAt: 1 },
        { id: 'sad', name: 'Sad', uri: 'file://alice-sad.png', createdAt: 1 },
      ],
    };
    seedStore({
      mediaLibrary: [asset({ id: 'sad', uri: 'file://alice-sad.png' })],
      imageAssetIdsByStory: { 'story-1': ['sad'] },
      characterLibraries: { 'story-1': [twoSprites] },
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      setCharacterLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sad.png, Alice' }));
    await waitFor(() => expect(screen.getByText('Alice · Sad')).toBeTruthy());

    await act(async () => {
      (useAppStore as unknown as { setState: (value: StoreSeed) => void }).setState({
        characterLibraries: {
          'story-1': [{
            ...twoSprites,
            sprites: [...twoSprites.sprites, { id: 'angry', name: 'Angry', uri: 'file://alice-angry.png', createdAt: 3 }],
          }],
        },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Make default for Alice' }));

    expect(setCharacterLibrary).toHaveBeenCalledWith('story-1', [
      expect.objectContaining({
        defaultSpriteId: 'sad',
        sprites: expect.arrayContaining([expect.objectContaining({ id: 'angry' })]),
      }),
    ]);
  });

  // A scene added elsewhere while this screen was open is a scene the library
  // never read — and it may be the one that shows this sprite. The write asks
  // the completeness question again rather than trusting the gate that opened.
  it('refuses the detach when the story grew a scene it has not read', async () => {
    const setCharacterLibrary = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characterLibraries: { 'story-1': [alice] },
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      setCharacterLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sprite.png, Alice' }));
    const detach = await screen.findByRole('button', { name: 'Remove from Alice' });

    act(() => {
      (useAppStore as unknown as { setState: (value: StoreSeed) => void }).setState({
        storiesMetadata: [{ id: 'story-1', title: 'My story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 2 }],
      });
      detach.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setCharacterLibrary).not.toHaveBeenCalled();
  });

  // A rejected load is not a finished one. Nothing about the story's usage is
  // known, and the screen has to say so rather than sit on "checking…".
  it('says usage cannot be checked when the load fails', async () => {
    seedStore({
      mediaLibrary: [asset({ id: 'sprite', uri: 'file://alice.png' })],
      imageAssetIdsByStory: { 'story-1': ['sprite'] },
      characterLibraries: { 'story-1': [alice] },
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      hydrateSceneRecordsForStory: vi.fn(() => Promise.reject(new Error('storage unavailable'))),
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sprite.png, Alice' }));

    // Even though a scene is in memory and would say the sprite is unused.
    await waitFor(() => expect(screen.getAllByText('Could not check where this file is used.').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Remove from Alice' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove imported file' })).toBeNull();
  });

  // Disabling the chip leaves the grid filtered by the answer that just stopped
  // being trustworthy, which reads as "these files vanished".
  it('drops an active usage filter when usage stops being knowable', async () => {
    seedStore({
      mediaLibrary: [asset({ id: 'bg' }), asset({ id: 'spare' })],
      imageAssetIdsByStory: { 'story-1': ['bg', 'spare'] },
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': scene([
            { id: 'step-1', blockType: 'background', enabled: true, data: { assetId: 'bg' } } as TimelineStep,
          ]),
        },
      },
    });

    render(<StoryGalleryRoute />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Used' }));
    expect(screen.queryByRole('button', { name: 'Image, spare.png' })).toBeNull();

    // The story grows a scene this screen has not read.
    (useAppStore as unknown as { setState: (value: StoreSeed) => void }).setState({
      storiesMetadata: [{ id: 'story-1', title: 'My story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 2 }],
    });
    // Harness detail, not product behaviour: the store double here has no
    // subscription, so a write alone renders nothing. Any interaction is what
    // makes the screen read it again — selecting a tile touches nothing else.
    fireEvent.click(screen.getByRole('button', { name: 'Image, bg.png' }));

    expect(screen.getByRole('button', { name: 'Image, spare.png' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Image, bg.png' })).toBeTruthy();
  });

  it('makes a sprite the character default through the store', async () => {
    const setCharacterLibrary = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'sad', uri: 'file://alice-sad.png' })],
      imageAssetIdsByStory: { 'story-1': ['sad'] },
      characterLibraries: {
        'story-1': [{
          ...alice,
          defaultSpriteId: 'happy',
          sprites: [
            { id: 'happy', name: 'Happy', uri: 'file://alice.png', createdAt: 1 },
            { id: 'sad', name: 'Sad', uri: 'file://alice-sad.png', createdAt: 1 },
          ],
        }],
      },
      setCharacterLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, sad.png, Alice' }));
    await waitFor(() => expect(screen.getByText('Alice · Sad')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Make default for Alice' }));

    expect(setCharacterLibrary).toHaveBeenCalledWith('story-1', [
      expect.objectContaining({ defaultSpriteId: 'sad' }),
    ]);
  });

  it('returns to the scene it was opened from', () => {
    setLocalSearchParamsForTests({ storyId: 'story-1', sceneId: 'scene-7' });
    seedStore({});

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(getRouterForTests().push).toHaveBeenCalledWith({
      pathname: '/document-editor',
      params: { storyId: 'story-1', sceneId: 'scene-7' },
    });
  });

  it('removes an unused file through the store and blocks a used one', async () => {
    const removeImageAssetFromStory = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'spare' }), asset({ id: 'bg' })],
      imageAssetIdsByStory: { 'story-1': ['spare', 'bg'] },
      sceneRecordsByStory: {
        'story-1': {
          'scene-1': scene([
            { id: 'step-1', blockType: 'background', enabled: true, data: { assetId: 'bg' } } as TimelineStep,
          ]),
        },
      },
      removeImageAssetFromStory,
    });

    render(<StoryGalleryRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Image, bg.png' }));
    await waitFor(() => expect(screen.getByText(/used in the scenes below/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Remove imported file' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Image, spare.png' }));
    await waitFor(() => expect(screen.getByText('Not used in any scene')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Remove imported file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(removeImageAssetFromStory).toHaveBeenCalledWith('story-1', 'spare');
  });

  it('shows the story sounds on their own tab, with the two categories', async () => {
    seedStore({
      mediaLibrary: [
        asset({ id: 'bgm', type: 'audio', uri: 'file://bgm.mp3', name: 'main-theme.mp3' }),
        asset({ id: 'door', type: 'audio', uri: 'file://door.mp3', name: 'door.mp3' }),
        asset({ id: 'bg' }),
      ],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
      mediaAssetIdsByStory: { 'story-1': ['bgm', 'door'] },
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('tab', { name: /Sounds/ }));

    expect(screen.getByRole('button', { name: 'Sound, main-theme.mp3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sound, door.mp3' })).toBeTruthy();
    // The image stays on its own tab.
    expect(screen.queryByRole('button', { name: 'Image, bg.png' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Music' }));
    expect(screen.getByRole('button', { name: 'Sound, main-theme.mp3' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sound, door.mp3' })).toBeNull();
  });

  // Leftover entries are read back into story membership on every hydration, so
  // one left behind would bring the file back on the next launch.
  it('drops the audio library entry when the sound is removed', async () => {
    const removeMediaAssetFromStory = vi.fn();
    const setAudioLibrary = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'bgm', type: 'audio', uri: 'file://bgm.mp3', name: 'bgm.mp3' })],
      mediaAssetIdsByStory: { 'story-1': ['bgm'] },
      // The story's one scene has to be in memory, or usage is unknown and
      // nothing destructive is offered at all.
      sceneRecordsByStory: { 'story-1': { 'scene-1': scene([]) } },
      audioLibraries: {
        'story-1': [
          { id: 'bgm', name: 'bgm.mp3', uri: 'file://bgm.mp3', type: 'music', createdAt: 1 },
          { id: 'other', name: 'other.mp3', uri: 'file://other.mp3', type: 'sfx', createdAt: 1 },
        ],
      },
      removeMediaAssetFromStory,
      setAudioLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('tab', { name: /Sounds/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sound, bgm.mp3' }));

    await waitFor(() => expect(screen.getByText('Not used in any scene')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Remove imported file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(removeMediaAssetFromStory).toHaveBeenCalledWith('story-1', 'bgm');
    // Only that file's entry: the rest of the audio library is untouched.
    expect(setAudioLibrary).toHaveBeenCalledWith('story-1', [
      expect.objectContaining({ id: 'other' }),
    ]);
  });

  it('stores the category the author picks for a sound', async () => {
    const setAudioLibrary = vi.fn();
    seedStore({
      mediaLibrary: [asset({ id: 'door', type: 'audio', uri: 'file://door.mp3', name: 'door.mp3' })],
      mediaAssetIdsByStory: { 'story-1': ['door'] },
      setAudioLibrary,
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('tab', { name: /Sounds/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sound, door.mp3' }));

    // The name guess made it a sound effect; the author says otherwise. The
    // chip is named for what it does — "Music" alone is also a filter chip.
    fireEvent.click(screen.getByRole('button', { name: 'Mark as music' }));

    expect(setAudioLibrary).toHaveBeenCalledWith('story-1', [
      expect.objectContaining({ id: 'door', uri: 'file://door.mp3', type: 'music' }),
    ]);
  });

  // A tile the author has filtered away takes the only stop button with it.
  it('stops a sound whose tile leaves the grid', async () => {
    seedStore({
      mediaLibrary: [
        asset({ id: 'bgm', type: 'audio', uri: 'file://bgm.mp3', name: 'bgm.mp3' }),
        asset({ id: 'door', type: 'audio', uri: 'file://door.mp3', name: 'door.mp3' }),
      ],
      mediaAssetIdsByStory: { 'story-1': ['bgm', 'door'] },
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('tab', { name: /Sounds/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));
    await waitFor(() => expect(mockAudioPlayers).toHaveLength(1));

    // Searching for the other file hides the one that is playing.
    fireEvent.change(screen.getByPlaceholderText('Search by file, character or sprite'), {
      target: { value: 'door' },
    });

    await waitFor(() => expect(mockAudioPlayers[0].remove).toHaveBeenCalled());
    expect(mockAudioPlayers[0].pause).toHaveBeenCalled();
  });

  // `+` used to pick an image whichever tab was open, so on the video tab it
  // offered the author a file the tab could not even show. What the dialog
  // accepts is the observable end of that decision.
  it('adds what the open tab shows rather than always an image', async () => {
    seedStore();
    render(<StoryGalleryRoute />);

    const acceptAfterAdd = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      const input = await waitFor(() => {
        const element = document.querySelector('input[type="file"]') as HTMLInputElement | null;
        if (!element) throw new Error('expected a file dialog');
        return element;
      });
      const { accept } = input;
      input.dispatchEvent(new Event('cancel'));
      return accept;
    };

    expect(await acceptAfterAdd()).toContain('image/');

    fireEvent.click(screen.getByRole('tab', { name: /Sounds/ }));
    expect(await acceptAfterAdd()).toContain('audio/');

    fireEvent.click(screen.getByRole('tab', { name: /Videos/ }));
    expect(await acceptAfterAdd()).toContain('video/');
  });
});
