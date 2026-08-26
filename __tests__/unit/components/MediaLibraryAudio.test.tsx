/**
 * Audio preview: the one player the media library screen owns, driven from the
 * grid tiles and the inspector.
 *
 * These sit apart from MediaLibrary.test.tsx because they need the expo-audio
 * fake and a component that holds the hook — the rest of the library tests are
 * pure render assertions.
 */
import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import { MediaGrid } from '@/components/media-library/MediaGrid';
import { MediaInspector } from '@/components/media-library/MediaInspector';
import { useAudioPreview } from '@/hooks/useAudioPreview';
import { acquireResolvedAssetUri } from '@/lib/asset-resolver';
import { Colors } from '@/lib/_core/theme';
import type { LibraryAsset } from '@/lib/media-library-service';
import { buildStoryMediaGallery, type StoryMediaItem } from '@/lib/story-media-gallery';
// Test-only helpers come from the mock path: the alias applies at runtime, but
// the real module has no such export for tsc to find.
import { mockAudioPlayers, resetMockAudioPlayers } from '../../../__mocks__/expo-audio';

const colors = Colors.light;
const NOW = new Date('2026-08-24T12:00:00Z').getTime();

function track(id: string, overrides: Partial<LibraryAsset> = {}): LibraryAsset {
  return {
    id,
    type: 'audio',
    uri: `file://${id}.mp3`,
    name: `${id}.mp3`,
    addedAt: NOW,
    ...overrides,
  };
}

function audios(ids: string[]): StoryMediaItem[] {
  return buildStoryMediaGallery({
    storyId: 'story-1',
    mediaLibrary: ids.map((id) => track(id)),
    imageAssetIdsByStory: {},
    mediaAssetIdsByStory: { 'story-1': ids },
    characters: [],
    scenes: [],
  }).audios;
}

/** The screen in miniature: one controller, handed to the grid. */
function Screen({ items }: { items: StoryMediaItem[] }) {
  const preview = useAudioPreview();
  const onSelect = vi.fn();
  return (
    <MediaGrid
      items={items}
      colors={colors}
      selectedKey={null}
      grouped={false}
      now={NOW}
      emptyLabel="No sounds in this story yet."
      onSelect={onSelect}
      onTogglePlayback={(item) => preview.toggle({ key: item.key, assetId: item.assetId, uri: item.uri })}
      playingKey={preview.playingKey}
      progress={preview.progress}
    />
  );
}

beforeEach(() => {
  resetMockAudioPlayers();
  vi.mocked(acquireResolvedAssetUri).mockClear();
});

describe('audio preview', () => {
  it('plays the tile the author tapped', async () => {
    render(<Screen items={audios(['bgm'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));

    await waitFor(() => expect(mockAudioPlayers).toHaveLength(1));
    expect(mockAudioPlayers[0].source).toBe('bgm');
    expect(mockAudioPlayers[0].play).toHaveBeenCalled();
    // The button flips, which is also how the author stops it again.
    expect(screen.getByRole('button', { name: 'Stop bgm.mp3' })).toBeTruthy();
  });

  // The asset id survives a reload; the runtime blob: URI in `uri` does not.
  it('resolves through the asset id rather than the URI', async () => {
    render(<Screen items={audios(['bgm'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));

    await waitFor(() => expect(acquireResolvedAssetUri).toHaveBeenCalledWith('bgm'));
  });

  it('stops the tile that was playing when another one starts', async () => {
    render(<Screen items={audios(['one', 'two'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play one.mp3' }));
    await waitFor(() => expect(mockAudioPlayers).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Play two.mp3' }));
    await waitFor(() => expect(mockAudioPlayers).toHaveLength(2));

    // The first player is gone, not merely paused: nothing else would ever
    // release it, and a paused player still holds its lease.
    expect(mockAudioPlayers[0].pause).toHaveBeenCalled();
    expect(mockAudioPlayers[0].remove).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play one.mp3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop two.mp3' })).toBeTruthy();
  });

  it('stops the same tile on a second tap', async () => {
    render(<Screen items={audios(['bgm'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));
    await waitFor(() => expect(mockAudioPlayers).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Stop bgm.mp3' }));

    expect(mockAudioPlayers[0].remove).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play bgm.mp3' })).toBeTruthy();
    // And no second player was created for the same file.
    expect(mockAudioPlayers).toHaveLength(1);
  });

  it('returns the tile to its stopped state when the track ends', async () => {
    render(<Screen items={audios(['bgm'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));
    await waitFor(() => expect(mockAudioPlayers).toHaveLength(1));

    act(() => mockAudioPlayers[0].emitStatus({ didJustFinish: true }));

    expect(screen.getByRole('button', { name: 'Play bgm.mp3' })).toBeTruthy();
    expect(mockAudioPlayers[0].remove).toHaveBeenCalled();
  });

  // Nothing else holds this player, so a sound left running would keep playing
  // with no control anywhere on screen.
  it('stops when the screen goes away', async () => {
    const view = render(<Screen items={audios(['bgm'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));
    await waitFor(() => expect(mockAudioPlayers).toHaveLength(1));

    view.unmount();

    expect(mockAudioPlayers[0].pause).toHaveBeenCalled();
    expect(mockAudioPlayers[0].remove).toHaveBeenCalled();
  });

  it('reports a file it could not resolve instead of pretending to play it', async () => {
    vi.mocked(acquireResolvedAssetUri).mockResolvedValueOnce({ source: null, release: () => {} });
    render(<Screen items={audios(['gone'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play gone.mp3' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Play gone.mp3' })).toBeTruthy());
    expect(mockAudioPlayers).toHaveLength(0);
  });

  // Selecting a tile is not auditioning it: the transport is a separate control
  // precisely so one does not trigger the other.
  it('does not start playback when the tile itself is tapped', async () => {
    render(<Screen items={audios(['bgm'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sound, bgm.mp3' }));

    expect(mockAudioPlayers).toHaveLength(0);
  });

  it('follows the position through the track', async () => {
    const { result } = renderHook(() => useAudioPreview());

    act(() => result.current.toggle({ key: 'asset:bgm', assetId: 'bgm', uri: 'file://bgm.mp3' }));
    await waitFor(() => expect(mockAudioPlayers).toHaveLength(1));

    act(() => mockAudioPlayers[0].emitStatus({ currentTime: 30, duration: 60 }));
    expect(result.current.progress).toBe(0.5);

    // A track whose duration is not known yet must not divide by zero.
    act(() => mockAudioPlayers[0].emitStatus({ currentTime: 5, duration: 0 }));
    expect(result.current.progress).toBe(0);
  });
});

describe('audio in the inspector', () => {
  // Named so the category falls out of the name guess as a sound effect —
  // "bgm" would read as music.
  const item = () => audios(['door'])[0];

  function renderInspector(overrides: Record<string, unknown> = {}) {
    const onTogglePlayback = vi.fn();
    render(
      <MediaInspector
        item={item()}
        colors={colors}
        asSheet={false}
        canRemoveBackground={false}
        removingBackground={false}
        characters={[]}
        usageState="ready"
        onClose={vi.fn()}
        onOpenScene={vi.fn()}
        onRemoveBackground={vi.fn()}
        onRemoveFromStory={vi.fn()}
        onAttachToCharacter={vi.fn()}
        onDetachFromCharacter={vi.fn()}
        onMakeDefaultSprite={vi.fn()}
        onTogglePlayback={onTogglePlayback}
        {...overrides}
      />,
    );
    return onTogglePlayback;
  }

  it('drives the same controller as the grid and shows the category', () => {
    const onTogglePlayback = renderInspector();

    fireEvent.click(screen.getByRole('button', { name: 'Play door.mp3' }));
    expect(onTogglePlayback).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'door' }));
    expect(screen.getByText(/Sound effect/)).toBeTruthy();
    // Audio belongs to no character, so the sprite actions stay out of it.
    expect(screen.queryByRole('button', { name: 'Add to character…' })).toBeNull();
  });

  it('shows the playing state and a failure it cannot recover from', () => {
    renderInspector({ playing: true });
    expect(screen.getByRole('button', { name: 'Stop door.mp3' })).toBeTruthy();

    renderInspector({ playbackFailed: true });
    expect(screen.getByText('This sound could not be opened.')).toBeTruthy();
  });
});
