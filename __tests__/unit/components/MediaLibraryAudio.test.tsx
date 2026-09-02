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

import { MediaBrowser } from '@/components/media-library/MediaBrowser';
import { MediaInspector } from '@/components/media-library/MediaInspector';
import { useAudioPreview } from '@/hooks/useAudioPreview';
import { acquireResolvedAssetUri } from '@/lib/asset-resolver';
import { Colors } from '@/lib/_core/theme';
import type { LibraryAsset } from '@/lib/media-library-service';
import { buildStoryMediaGallery, type StoryMediaItem } from '@/lib/story-media-gallery';
// Test-only helpers come from the mock path: the alias applies at runtime, but
// the real module has no such export for tsc to find.
import { mockAudioPlayers, mockCreateAudioPlayer, resetMockAudioPlayers } from '../../../__mocks__/expo-audio';

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

/** The screen in miniature: one controller, handed to the track list. */
function Screen({ items }: { items: StoryMediaItem[] }) {
  const preview = useAudioPreview();
  const onSelect = vi.fn();
  return (
    <MediaBrowser
      view="audio"
      images={[]}
      videos={[]}
      audios={items}
      colors={colors}
      selectedKey={null}
      grouped={false}
      now={Date.now()}
      emptyLabel="No sounds in this story yet."
      usageState="ready"
      onSelect={onSelect}
      onTogglePlayback={(item: StoryMediaItem) => preview.toggle({ key: item.key, assetId: item.assetId, uri: item.uri })}
      activeAudioKey={preview.activeKey}
      previewState={preview.state}
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
    // Still resolving and starting: the button offers to call it off.
    expect(screen.getByRole('button', { name: 'Stop bgm.mp3' })).toBeTruthy();

    act(() => mockAudioPlayers[0].emitStatus({ playing: true, currentTime: 1, duration: 60 }));

    // Once it is actually sounding the same button pauses it.
    expect(screen.getByRole('button', { name: 'Pause bgm.mp3' })).toBeTruthy();
  });

  // The asset id survives a reload; the runtime blob: URI in `uri` does not.
  it('resolves through the asset id rather than the URI', async () => {
    render(<Screen items={audios(['bgm'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));

    await waitFor(() => expect(acquireResolvedAssetUri).toHaveBeenCalledWith('bgm'));
  });

  it('stops the row that was playing when another one starts', async () => {
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

  // The button says Stop the moment it is tapped, while the URI is still being
  // resolved. Tapping it then has to call that attempt off — it used to start a
  // second resolve, and the sound the author had just stopped began to play.
  it('calls off a start that is still resolving', async () => {
    let releaseLease: (() => void) | undefined;
    let resolveLease: ((lease: { source: string; release: () => void }) => void) | undefined;
    vi.mocked(acquireResolvedAssetUri).mockImplementationOnce(() => new Promise((resolve) => {
      resolveLease = resolve;
    }));

    render(<Screen items={audios(['bgm'])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));

    const stop = screen.getByRole('button', { name: 'Stop bgm.mp3' });
    fireEvent.click(stop);
    expect(screen.getByRole('button', { name: 'Play bgm.mp3' })).toBeTruthy();

    // The resolve lands after the author has already given up on it.
    releaseLease = vi.fn();
    await act(async () => {
      resolveLease?.({ source: 'bgm', release: releaseLease! });
    });

    expect(mockAudioPlayers).toHaveLength(0);
    // And the pin it came back holding is handed straight back.
    expect(releaseLease).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play bgm.mp3' })).toBeTruthy();
  });

  it('pauses and resumes without rebuilding the player', async () => {
    render(<Screen items={audios(['bgm'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));
    await waitFor(() => expect(mockAudioPlayers).toHaveLength(1));
    act(() => mockAudioPlayers[0].emitStatus({ playing: true, currentTime: 2, duration: 60 }));

    fireEvent.click(screen.getByRole('button', { name: 'Pause bgm.mp3' }));
    expect(mockAudioPlayers[0].pause).toHaveBeenCalled();
    // Paused, not torn down: resuming has to carry on from where it stopped.
    expect(mockAudioPlayers[0].remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));
    expect(mockAudioPlayers[0].play).toHaveBeenCalledTimes(2);
    expect(mockAudioPlayers).toHaveLength(1);
  });

  it('returns the row to its stopped state when the track ends', async () => {
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

  // Selecting a row is not auditioning it: the transport is a separate control
  // precisely so one does not trigger the other.
  it('does not start playback when the row itself is tapped', async () => {
    render(<Screen items={audios(['bgm'])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sound, bgm.mp3' }));

    expect(mockAudioPlayers).toHaveLength(0);
  });

  /**
   * expo-audio on web hands `play()` to an HTMLMediaElement, drops the promise
   * it returns and wires no error handler, so a refused play and a file that
   * cannot decode are both indistinguishable from one still loading. Silence
   * for long enough is the only signal there is.
   */
  it('gives up on a file that never starts sounding', async () => {
    vi.useFakeTimers();
    try {
      const release = vi.fn();
      vi.mocked(acquireResolvedAssetUri).mockResolvedValueOnce({ source: 'bgm', release });
      render(<Screen items={audios(['bgm'])} />);

      fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));
      await act(async () => {});
      expect(mockAudioPlayers).toHaveLength(1);

      await act(async () => { vi.advanceTimersByTime(4000); });

      expect(screen.getByRole('button', { name: 'Play bgm.mp3' })).toBeTruthy();
      // The player and the pin it held are both let go, rather than sitting
      // there until the author leaves the screen.
      expect(mockAudioPlayers[0].remove).toHaveBeenCalled();
      expect(release).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // Same worry, the synchronous half: without the catch the lease and a
  // half-built player would be held until the next tap.
  it('lets go when building the player throws outright', async () => {
    const release = vi.fn();
    vi.mocked(acquireResolvedAssetUri).mockResolvedValueOnce({ source: 'bgm', release });
    mockCreateAudioPlayer.mockImplementationOnce(() => { throw new Error('no codec'); });

    render(<Screen items={audios(['bgm'])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play bgm.mp3' }));

    await waitFor(() => expect(release).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Play bgm.mp3' })).toBeTruthy();
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

  it('drives the same controller as the list and shows the category', () => {
    const onTogglePlayback = renderInspector();

    fireEvent.click(screen.getByRole('button', { name: 'Play door.mp3' }));
    expect(onTogglePlayback).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'door' }));
    expect(screen.getByText(/Sound effect/)).toBeTruthy();
    // Audio belongs to no character, so the sprite actions stay out of it.
    expect(screen.queryByRole('button', { name: 'Add to character…' })).toBeNull();
  });

  it('shows what the controller is doing and a failure it cannot recover from', () => {
    renderInspector({ previewState: 'loading' });
    expect(screen.getByRole('button', { name: 'Stop door.mp3' })).toBeTruthy();

    renderInspector({ previewState: 'playing' });
    expect(screen.getByRole('button', { name: 'Pause door.mp3' })).toBeTruthy();

    renderInspector({ playbackFailed: true });
    expect(screen.getByText('This sound could not be opened.')).toBeTruthy();
  });

  // The plan promised a position and a way to move through the track, not just
  // a play button and a decorative bar.
  it('shows the position and seeks through the track', () => {
    const onSeek = vi.fn();
    renderInspector({
      previewState: 'playing',
      positionSeconds: 30,
      durationSeconds: 120,
      onSeek,
    });

    expect(screen.getByText('0:30 / 2:00')).toBeTruthy();

    const seek = screen.getByRole('slider', { name: 'Position in door.mp3' }) as HTMLInputElement;
    expect(seek.max).toBe('120');
    fireEvent.change(seek, { target: { value: '75' } });
    expect(onSeek).toHaveBeenCalledWith(75);
  });

  // A file whose length nothing has reported yet must not render a slider that
  // claims the track has already finished.
  it('says nothing about a length it does not know', () => {
    renderInspector({ previewState: 'loading', positionSeconds: 0, durationSeconds: 0 });

    expect(screen.getByText('0:00 / --:--')).toBeTruthy();
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
  });
});
