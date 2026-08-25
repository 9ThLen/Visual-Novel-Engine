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
    hydrateSceneRecordsForStory: vi.fn(async () => {}),
    addImageAssetToStory: vi.fn(),
    removeImageAssetFromStory: vi.fn(),
    removeMediaAssetFromStory: vi.fn(),
    setCharacterLibrary: vi.fn(),
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
  it('explains an empty usage filter without denying the images exist', () => {
    seedStore({
      mediaLibrary: [asset({ id: 'bg' })],
      imageAssetIdsByStory: { 'story-1': ['bg'] },
    });

    render(<StoryGalleryRoute />);
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
  it('trusts an empty load only when the story claims no scenes', async () => {
    seedStore({
      storiesMetadata: [{ id: 'story-1', title: 'My story', startSceneId: 'scene-1', createdAt: 1, updatedAt: 1, sceneCount: 4 }],
      mediaLibrary: [asset({ id: 'spare' })],
      imageAssetIdsByStory: { 'story-1': ['spare'] },
    });

    render(<StoryGalleryRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Image, spare.png' }));

    await waitFor(() => expect(screen.getAllByText('Checking where this file is used…').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Remove imported file' })).toBeNull();
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
});
