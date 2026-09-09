/**
 * Sorting a handful of dropped files into the three things a story can hold.
 *
 * Dropping is the shortest path from a folder of art to a story, but the drop
 * itself says nothing about what was dropped: one gesture can carry a
 * background, a clip and two sounds. This decides which is which, before any
 * of them is read.
 *
 * Kept free of the DOM so the rule is testable: only the `name`, `type` and
 * `size` of each file are read, which is all a drop reports before the bytes
 * are touched.
 */

import { isSupportedAudioMimeType, isSupportedVideoMimeType } from '@/lib/media-library-service';

export type DroppedKind = 'image' | 'video' | 'audio';

/** What a drop reports about a file before anything reads it. */
export interface DroppedFileInfo {
  name: string;
  type: string;
}

const EXTENSION_KINDS: Record<string, DroppedKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  mp4: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  aac: 'audio',
};

/**
 * Which of the three a file is, or null when the library cannot take it.
 *
 * The declared type wins where there is one — a browser knows better than a
 * file name — but a drop from a zip or a network share often declares nothing,
 * and refusing those would make the feature fail exactly where it is handiest.
 */
export function droppedFileKind(file: DroppedFileInfo): DroppedKind | null {
  const declared = (file.type ?? '').toLowerCase().split(';')[0].trim();
  if (declared) {
    if (declared.startsWith('image/')) return 'image';
    if (isSupportedVideoMimeType(declared)) return 'video';
    if (isSupportedAudioMimeType(declared)) return 'audio';
    // A declared type the library does not support is an answer, not a gap:
    // an .avi is a video, and the library still cannot take it.
    if (declared.startsWith('video/') || declared.startsWith('audio/')) return null;
  }
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  return EXTENSION_KINDS[extension] ?? null;
}

export interface DroppedFileGroups<T extends DroppedFileInfo> {
  image: T[];
  video: T[];
  audio: T[];
  /** Files of a kind the library has no place for. */
  rejected: T[];
}

export function classifyDroppedFiles<T extends DroppedFileInfo>(files: readonly T[]): DroppedFileGroups<T> {
  const groups: DroppedFileGroups<T> = { image: [], video: [], audio: [], rejected: [] };
  for (const file of files) {
    const kind = droppedFileKind(file);
    if (kind) groups[kind].push(file);
    else groups.rejected.push(file);
  }
  return groups;
}
