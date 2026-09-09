/**
 * What the library can say about a story when no single file is selected.
 *
 * The inspector only has something to show once the author picks a file, so on
 * a wide screen the panel it lives in used to be empty — which is most of the
 * time, and most of why the screen read as unfinished. This is what goes there
 * instead: how much of each kind the story carries, what it weighs, and what
 * nothing points at.
 */

import type { StoryMediaGallery, StoryMediaItem } from '@/lib/story-media-gallery';

export interface StoryMediaSummary {
  counts: { image: number; video: number; audio: number; total: number };
  /** Only files whose size the library actually recorded. */
  bytes: { image: number; video: number; audio: number; total: number };
  /**
   * Files counted above whose size is unknown — a sprite that never entered the
   * media library has no `sizeBytes`. The bar is drawn from `bytes`, so it must
   * say when it is describing fewer files than the counts do.
   */
  unsizedCount: number;
  /**
   * Files no scene points at. Only meaningful once usage is known; the panel
   * withholds it otherwise rather than calling an unread library unused.
   */
  unused: { count: number; bytes: number };
  /** Newest first, across every kind. */
  recent: StoryMediaItem[];
}

const RECENT_LIMIT = 3;

export function summarizeStoryMedia(
  gallery: StoryMediaGallery,
  recentLimit: number = RECENT_LIMIT,
): StoryMediaSummary {
  const groups = [
    { kind: 'image' as const, items: gallery.images },
    { kind: 'video' as const, items: gallery.videos },
    { kind: 'audio' as const, items: gallery.audios },
  ];

  const counts = { image: 0, video: 0, audio: 0, total: 0 };
  const bytes = { image: 0, video: 0, audio: 0, total: 0 };
  let unsizedCount = 0;
  let unusedCount = 0;
  let unusedBytes = 0;

  groups.forEach(({ kind, items }) => {
    counts[kind] = items.length;
    counts.total += items.length;
    items.forEach((item) => {
      if (item.sizeBytes === undefined) unsizedCount += 1;
      else {
        bytes[kind] += item.sizeBytes;
        bytes.total += item.sizeBytes;
      }
      if (item.usage.enabled + item.usage.disabled === 0) {
        unusedCount += 1;
        unusedBytes += item.sizeBytes ?? 0;
      }
    });
  });

  const recent = groups
    .flatMap((group) => group.items)
    .sort((left, right) => right.addedAt - left.addedAt)
    .slice(0, recentLimit);

  return {
    counts,
    bytes,
    unsizedCount,
    unused: { count: unusedCount, bytes: unusedBytes },
    recent,
  };
}
