/**
 * Display model for the audio track list.
 *
 * The grid answers "what does this story own". A track list has to answer
 * "which of these do I want to hear", and that is settled by the role a file
 * plays, not by the week it was added — so the rows group by category rather
 * than by date, and every row carries the paperwork the inspector could only
 * show one file at a time.
 *
 * Nothing here is persisted or rendered: it is the arithmetic the list does
 * before it draws, kept apart from the component so it can be tested without
 * one.
 */

import type { AudioCategory, StoryMediaItem, UsageState } from '@/lib/story-media-gallery';

export type AudioTrackRow =
  | { type: 'header'; key: string; category: AudioCategory; count: number }
  | { type: 'track'; key: string; item: StoryMediaItem };

/**
 * Music first. It is the longer, fewer, more deliberate half of a story's
 * audio, and the half an author reaches for while a scene is still being
 * written; effects are picked once the beats already exist.
 */
const CATEGORY_ORDER: AudioCategory[] = ['music', 'sound'];

/**
 * @param grouped when false the tracks render as one uninterrupted list. Under
 * a category filter the headers would name a group holding every visible row,
 * and under a search they would split a handful of matches into two lists of
 * one — the same reason the grid drops its date headers.
 */
export function buildAudioTrackRows(items: StoryMediaItem[], grouped: boolean): AudioTrackRow[] {
  if (!grouped) {
    return items.map((item) => ({ type: 'track', key: item.key, item }));
  }

  return CATEGORY_ORDER.flatMap<AudioTrackRow>((category) => {
    // A file whose category nothing has decided yet reads as a sound effect,
    // exactly as `guessAudioCategoryFromName` would have it — this list must
    // never be shorter than the tab's own count.
    const group = items.filter((item) => (item.audioCategory ?? 'sound') === category);
    if (!group.length) return [];
    return [
      { type: 'header', key: `header-${category}`, category, count: group.length },
      ...group.map<AudioTrackRow>((item) => ({ type: 'track', key: item.key, item })),
    ];
  });
}

const MIME_LABELS: Record<string, string> = {
  'audio/mpeg': 'MP3',
  'audio/mp3': 'MP3',
  'audio/wav': 'WAV',
  'audio/wave': 'WAV',
  'audio/x-wav': 'WAV',
  'audio/ogg': 'OGG',
  'audio/vorbis': 'OGG',
  'audio/mp4': 'M4A',
  'audio/x-m4a': 'M4A',
  'audio/aac': 'AAC',
  'audio/flac': 'FLAC',
  'audio/webm': 'WEBM',
};

/**
 * What to call the file's format in one word.
 *
 * The MIME type is the better source — Android hands back file names with no
 * extension at all — but it is also the one that arrives as
 * `application/octet-stream` from some pickers, so an extension it does not
 * recognise still gets a chance to speak.
 */
export function audioFormatLabel(file: { mimeType?: string; name: string }): string | null {
  const mime = file.mimeType?.toLowerCase().split(';')[0]?.trim();
  if (mime && MIME_LABELS[mime]) return MIME_LABELS[mime];
  const extension = /\.([a-z0-9]{2,4})$/i.exec(file.name)?.[1];
  return extension ? extension.toUpperCase() : null;
}

/**
 * One scene can name the same file from several steps — a music block and a
 * sound block, or the same cue in two branches. The author cares which scenes
 * to visit, so the row counts scenes, not references.
 */
export function countScenesUsing(item: StoryMediaItem): number {
  return new Set(item.references.map((reference) => reference.sceneId)).size;
}

export type AudioUsageBadge =
  | { kind: 'pending' }
  | { kind: 'unavailable' }
  | { kind: 'used'; count: number }
  | { kind: 'unused' };

/**
 * Whether the row may claim anything about where the file is used.
 *
 * Until the story's scenes are loaded every file looks unused, which is an
 * artefact of the load rather than an answer — and a row that says `unused` is
 * exactly the row an author deletes. So the two states without an answer get
 * to say so instead of guessing.
 */
export function audioUsageBadge(item: StoryMediaItem, usageState: UsageState): AudioUsageBadge {
  if (usageState === 'pending') return { kind: 'pending' };
  if (usageState === 'unavailable') return { kind: 'unavailable' };
  const count = countScenesUsing(item);
  return count > 0 ? { kind: 'used', count } : { kind: 'unused' };
}
