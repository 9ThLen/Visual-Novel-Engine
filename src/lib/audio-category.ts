/**
 * The two roles audio has in a timeline: a `music` block is the background
 * track, a `sound` block is a one-shot effect. `AudioLibraryItem` names four
 * types, but `voice` and `ambient` play through the same blocks as `sfx`, so
 * anything that has to decide "which of the two is this" works in these terms.
 *
 * Its own module because both the audio library and the media library need the
 * guess, and the test harness replaces `lib/audio-library` wholesale with a
 * stub — a media-library rule that imported it from there would be untestable.
 */

import type { AudioLibraryItem } from './audio-types';

export type AudioCategory = 'music' | 'sound';

const MUSIC_WORDS = ['music', 'theme', 'bgm'];

/**
 * Last-resort guess for a file nothing plays yet. It reads a handful of words
 * out of the file name, so it is a guess and never outranks a real answer —
 * see `audioCategoryOf` for the order.
 */
export function guessAudioCategoryFromName(name: string): AudioCategory {
  const normalized = name.toLowerCase();
  return MUSIC_WORDS.some((word) => normalized.includes(word)) ? 'music' : 'sound';
}

/** Which category an audio library entry stands for. */
export function categoryOfAudioItem(item: AudioLibraryItem): AudioCategory {
  return item.type === 'music' ? 'music' : 'sound';
}

/**
 * Record the author's own answer about a file, as an entry in the story's
 * audio library — the one source `audioCategoryOf` trusts above the scenes.
 *
 * An entry that already says the right thing is left exactly as it is: `voice`
 * and `ambient` both mean "sound" here, and rewriting them to `sfx` would throw
 * away a distinction the library keeps for the reader.
 */
export function setAudioCategoryInLibrary(
  library: AudioLibraryItem[],
  file: { assetId?: string; uri: string; name: string; addedAt: number },
  category: AudioCategory,
): AudioLibraryItem[] {
  const matches = (entry: AudioLibraryItem) => entry.id === file.assetId || entry.uri === file.uri;
  const existing = library.find(matches);

  if (existing) {
    if (categoryOfAudioItem(existing) === category) return library;
    return library.map((entry) => (matches(entry)
      ? { ...entry, type: category === 'music' ? 'music' as const : 'sfx' as const }
      : entry));
  }

  return [...library, {
    id: file.assetId ?? file.uri,
    name: file.name,
    uri: file.uri,
    type: category === 'music' ? 'music' : 'sfx',
    loop: category === 'music',
    volume: 1,
    tags: [],
    createdAt: file.addedAt,
  }];
}
