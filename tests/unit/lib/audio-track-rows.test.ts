/**
 * The arithmetic the audio track list does before it draws: which rows exist,
 * what the file's format is called, and whether the row may say anything at
 * all about where the file is used.
 */
import {
  audioFormatLabel,
  audioUsageBadge,
  buildAudioTrackRows,
  countScenesUsing,
} from '@/lib/audio-track-rows';
import type { AudioCategory, MediaReference, StoryMediaItem } from '@/lib/story-media-gallery';

const NOW = new Date('2026-08-24T12:00:00Z').getTime();

function reference(sceneId: string, stepId: string): MediaReference {
  return { sceneId, sceneName: sceneId, stepId, kind: 'music', enabled: true };
}

function track(
  name: string,
  overrides: Partial<StoryMediaItem> & { audioCategory?: AudioCategory } = {},
): StoryMediaItem {
  return {
    key: `asset:${name}`,
    kind: 'audio',
    uri: `file://${name}`,
    name,
    addedAt: NOW,
    assetId: name,
    owners: [],
    usage: { enabled: 0, disabled: 0 },
    references: [],
    audioCategory: 'sound',
    ...overrides,
  };
}

describe('buildAudioTrackRows', () => {
  it('puts music before sound effects, each behind its own header', () => {
    const rows = buildAudioTrackRows(
      [
        track('door.wav'),
        track('theme.mp3', { audioCategory: 'music' }),
        track('coin.wav'),
      ],
      true,
    );

    expect(rows.map((row) => (row.type === 'header' ? `#${row.category}` : row.item.name))).toEqual([
      '#music',
      'theme.mp3',
      '#sound',
      'door.wav',
      'coin.wav',
    ]);
    expect(rows.filter((row) => row.type === 'header').map((row) => row.type === 'header' && row.count))
      .toEqual([1, 2]);
  });

  it('leaves out a header for a category with nothing in it', () => {
    const rows = buildAudioTrackRows([track('door.wav')], true);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: 'header', category: 'sound' });
  });

  // Under a filter or a search the header would name a group holding every
  // visible row, which is a heading that says nothing.
  it('drops the headers when the list is not grouped', () => {
    const rows = buildAudioTrackRows(
      [track('theme.mp3', { audioCategory: 'music' }), track('door.wav')],
      false,
    );

    expect(rows.every((row) => row.type === 'track')).toBe(true);
    expect(rows).toHaveLength(2);
  });

  // The tab counts every audio file it has; a file nobody has categorised yet
  // must not fall out of the list between the two headers.
  it('files an uncategorised track under sound effects', () => {
    const rows = buildAudioTrackRows([track('mystery.wav', { audioCategory: undefined })], true);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: 'header', category: 'sound' });
  });
});

describe('audioFormatLabel', () => {
  it('reads the MIME type first', () => {
    expect(audioFormatLabel({ mimeType: 'audio/mpeg', name: 'theme.dat' })).toBe('MP3');
    expect(audioFormatLabel({ mimeType: 'audio/x-wav', name: 'door' })).toBe('WAV');
    // Some pickers append a codec parameter.
    expect(audioFormatLabel({ mimeType: 'audio/ogg; codecs=vorbis', name: 'hall' })).toBe('OGG');
  });

  // Android hands back `application/octet-stream` for files it will not sniff.
  it('falls back to the extension when the MIME type says nothing', () => {
    expect(audioFormatLabel({ mimeType: 'application/octet-stream', name: 'theme.flac' })).toBe('FLAC');
    expect(audioFormatLabel({ name: 'coin.wav' })).toBe('WAV');
  });

  it('says nothing rather than guessing at a name with no extension', () => {
    expect(audioFormatLabel({ name: 'recording' })).toBeNull();
  });
});

describe('usage', () => {
  // One scene can name the same file from several steps; the author cares which
  // scenes to visit, not how many blocks mention it.
  it('counts scenes rather than references', () => {
    const item = track('theme.mp3', {
      references: [reference('a', 'one'), reference('a', 'two'), reference('b', 'three')],
    });

    expect(countScenesUsing(item)).toBe(2);
    expect(audioUsageBadge(item, 'ready')).toEqual({ kind: 'used', count: 2 });
  });

  it('calls a file with no references unused', () => {
    expect(audioUsageBadge(track('coin.wav'), 'ready')).toEqual({ kind: 'unused' });
  });

  /**
   * Until the scenes are loaded every file looks unused — and `unused` is
   * exactly the badge an author deletes on. The two states without an answer
   * have to say so instead.
   */
  it('refuses to call anything unused before the scenes are known', () => {
    const item = track('coin.wav');
    expect(audioUsageBadge(item, 'pending')).toEqual({ kind: 'pending' });
    expect(audioUsageBadge(item, 'unavailable')).toEqual({ kind: 'unavailable' });
  });
});
