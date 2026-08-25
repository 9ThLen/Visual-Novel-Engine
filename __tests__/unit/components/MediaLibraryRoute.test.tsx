/**
 * The media library route, wired to the store the harness substitutes globally.
 *
 * The component tests next door drive the grid and inspector with props; this
 * one covers the seam between them — the screen's store reads, its filter
 * state, and the actions it dispatches back. It is not a test of the real
 * Zustand store, which the harness replaces for every suite.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
