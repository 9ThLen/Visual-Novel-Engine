/**
 * The audio track list, built from real gallery items rather than hand-written
 * ones — so a disagreement between the row and `buildStoryMediaGallery` about
 * what a sound looks like fails here.
 *
 * Playback lives in MediaLibraryAudio.test.tsx, which needs the expo-audio
 * fake; these are render assertions about what a row says.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { AudioTrackList } from '@/components/media-library/AudioTrackList';
import { Colors } from '@/lib/_core/theme';
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';
import {
  buildStoryMediaGallery,
  type StoryMediaItem,
  type UsageState,
} from '@/lib/story-media-gallery';

const colors = Colors.light;
const NOW = new Date('2026-08-24T12:00:00Z').getTime();

function clip(overrides: Partial<LibraryAsset> & { id: string }): LibraryAsset {
  return {
    type: 'audio',
    uri: `file://${overrides.id}.mp3`,
    name: `${overrides.id}.mp3`,
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

function audios(
  mediaLibrary: LibraryAsset[],
  extra: { scenes?: SceneRecord[]; audioLibrary?: AudioLibraryItem[] } = {},
): StoryMediaItem[] {
  return buildStoryMediaGallery({
    storyId: 'story-1',
    mediaLibrary,
    imageAssetIdsByStory: {},
    mediaAssetIdsByStory: { 'story-1': mediaLibrary.map((asset) => asset.id) },
    characters: [],
    scenes: extra.scenes ?? [],
    audioLibrary: extra.audioLibrary,
  }).audios;
}

function renderList(
  items: StoryMediaItem[],
  overrides: { usageState?: UsageState; grouped?: boolean; [key: string]: unknown } = {},
) {
  const onSelect = vi.fn();
  render(
    <AudioTrackList
      items={items}
      colors={colors}
      selectedKey={null}
      grouped={false}
      emptyLabel="No sounds in this story yet."
      usageState="ready"
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return onSelect;
}

describe('the row', () => {
  // The grid could only ever show the name. Everything else about the file was
  // one file at a time, behind the inspector.
  it('shows the file, its paperwork and its length', () => {
    const items = audios([
      clip({ id: 'bgm', name: 'main-theme.mp3', mimeType: 'audio/mpeg', size: 4_089_446, durationSeconds: 135 }),
    ]);

    renderList(items);

    expect(screen.getByRole('button', { name: 'Sound, main-theme.mp3' })).toBeTruthy();
    expect(screen.getByText('main-theme.mp3')).toBeTruthy();
    expect(screen.getByText(/MP3/)).toBeTruthy();
    expect(screen.getByText(/3\.9 MB/)).toBeTruthy();
    expect(screen.getByText('2:15')).toBeTruthy();
  });

  // Nothing reads a duration out of an audio file yet on every platform, and a
  // row that printed 0:00 would be claiming the file is empty.
  it('says it does not know the length rather than printing zero', () => {
    renderList(audios([clip({ id: 'door', name: 'door.mp3' })]));

    expect(screen.getByText('--:--')).toBeTruthy();
    expect(screen.queryByText('0:00')).toBeNull();
  });

  it('opens the inspector when the row is pressed', () => {
    const items = audios([clip({ id: 'door', name: 'door.mp3' })]);
    const onSelect = renderList(items);

    fireEvent.click(screen.getByRole('button', { name: 'Sound, door.mp3' }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'door.mp3' }));
  });

  // The transport is only there when the screen hands the list a controller.
  it('leaves out the transport when nothing can play', () => {
    renderList(audios([clip({ id: 'door', name: 'door.mp3' })]));
    expect(screen.queryByRole('button', { name: 'Play door.mp3' })).toBeNull();

    renderList(audios([clip({ id: 'coin', name: 'coin.mp3' })]), { onTogglePlayback: vi.fn() });
    expect(screen.getByRole('button', { name: 'Play coin.mp3' })).toBeTruthy();
  });
});

describe('what a row claims about usage', () => {
  const inScene = (assetId: string) => [scene([
    {
      id: 'step-1',
      blockType: 'music',
      enabled: true,
      collapsed: false,
      data: { mode: 'track', assetId },
    } as unknown as TimelineStep,
  ])];

  it('counts the scenes a sound plays in', () => {
    const items = audios([clip({ id: 'bgm' })], { scenes: inScene('bgm') });
    renderList(items);

    expect(screen.getByText('1 scene')).toBeTruthy();
  });

  it('marks a sound no scene names as unused', () => {
    renderList(audios([clip({ id: 'bgm' })]));
    expect(screen.getByText('unused')).toBeTruthy();
  });

  /**
   * Before the scenes load every file looks unused, which is an artefact of the
   * load rather than an answer — and `unused` is the badge an author deletes on.
   */
  it('says it is still checking rather than calling the file unused', () => {
    renderList(audios([clip({ id: 'bgm' })]), { usageState: 'pending' });
    expect(screen.getByText('checking…')).toBeTruthy();
    expect(screen.queryByText('unused')).toBeNull();
  });

  it('says usage is unknown when the load ended without an answer', () => {
    renderList(audios([clip({ id: 'bgm' })]), { usageState: 'unavailable' });
    expect(screen.getByText('usage unknown')).toBeTruthy();
    expect(screen.queryByText('unused')).toBeNull();
  });
});

describe('grouping and loop', () => {
  it('splits the list into music and sound effects', () => {
    const items = audios([clip({ id: 'theme' }), clip({ id: 'door' })]);
    renderList(items, { grouped: true });

    expect(screen.getByText('Music')).toBeTruthy();
    expect(screen.getByText('Sound effects')).toBeTruthy();
  });

  it('runs the rows together when the list is filtered', () => {
    const items = audios([clip({ id: 'theme' }), clip({ id: 'door' })]);
    renderList(items, { grouped: false });

    expect(screen.queryByText('Music')).toBeNull();
    expect(screen.queryByText('Sound effects')).toBeNull();
  });

  // `loop` is on the story's audio library entry and was never shown anywhere.
  it('marks a looping music track, and says nothing when nobody has decided', () => {
    const looping = audios([clip({ id: 'theme' })], {
      audioLibrary: [{
        id: 'theme',
        name: 'theme.mp3',
        uri: 'file://theme.mp3',
        type: 'music',
        loop: true,
        createdAt: 1,
      }],
    });
    renderList(looping);
    expect(screen.getByText('loop')).toBeTruthy();

    renderList(audios([clip({ id: 'other-theme' })]));
    expect(screen.queryAllByText('loop')).toHaveLength(1);
  });
});

it('shows the empty label it was given', () => {
  renderList([], { emptyLabel: 'Nothing here is used in a scene yet.' });
  expect(screen.getByText('Nothing here is used in a scene yet.')).toBeTruthy();
});
