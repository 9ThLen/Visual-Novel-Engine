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
