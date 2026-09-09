/**
 * The row model behind the media browser: one list that can hold squares and
 * track rows at the same time.
 *
 * The library used to be three tabs, each with its own list, so a story with a
 * handful of files read as three nearly empty screens. The "all" view answers
 * that by showing every kind in one scroll — and it does so without giving a
 * sound a square, because a sound has no picture to put in one. Images and
 * videos chunk into grid rows; audio stays the track row it already was.
 *
 * `numColumns` on FlatList cannot coexist with sections and SectionList has no
 * `numColumns`, so rows are pre-chunked here and the whole thing renders as one
 * flat virtualized list. Row height is knowable up front, which is what lets
 * the browser skip measurement.
 */

import { buildAudioTrackRows } from '@/lib/audio-track-rows';
import type { AudioCategory } from '@/lib/audio-category';
import {
  groupMediaByDate,
  type DateGroupLabel,
  type MediaKind,
  type StoryMediaItem,
} from '@/lib/story-media-gallery';

/** What the browser is showing. `all` is every kind in one scroll. */
export type MediaView = 'all' | MediaKind;

export const MEDIA_VIEWS: MediaView[] = ['all', 'image', 'video', 'audio'];

/** Why a header is there, which is also what it says. */
export type SectionLabel =
  | { source: 'kind'; kind: MediaKind }
  | { source: 'date'; label: DateGroupLabel }
  | { source: 'category'; category: AudioCategory };

export type BrowserRow =
  | { type: 'header'; key: string; label: SectionLabel; count: number }
  | { type: 'grid'; key: string; items: StoryMediaItem[] }
  | { type: 'track'; key: string; item: StoryMediaItem };

export type MediaSort = 'date' | 'name' | 'size' | 'usage';

export const MEDIA_SORTS: MediaSort[] = ['date', 'name', 'size', 'usage'];

function chunk(items: StoryMediaItem[], size: number): StoryMediaItem[][] {
  const rows: StoryMediaItem[][] = [];
  for (let index = 0; index < items.length; index += Math.max(1, size)) {
    rows.push(items.slice(index, index + Math.max(1, size)));
  }
  return rows;
}

function gridRows(items: StoryMediaItem[], columns: number, prefix: string): BrowserRow[] {
  return chunk(items, columns).map((row, index) => ({
    type: 'grid',
    key: `${prefix}-row-${index}`,
    items: row,
  }));
}

function trackRows(items: StoryMediaItem[], prefix: string): BrowserRow[] {
  return items.map((item) => ({ type: 'track', key: `${prefix}-${item.key}`, item }));
}

export interface BrowserRowsInput {
  view: MediaView;
  /** Already filtered, searched and sorted by the screen. */
  images: StoryMediaItem[];
  videos: StoryMediaItem[];
  audios: StoryMediaItem[];
  columns: number;
  /**
   * Whether the view earns its group headers. Under a filter or a search they
   * name a group holding every visible row, or split a handful of matches into
   * lists of one. The `all` view groups by kind regardless — that grouping is
   * what the view *is*, not decoration on top of it.
   */
  grouped: boolean;
  now: number;
}

export function buildBrowserRows({
  view,
  images,
  videos,
  audios,
  columns,
  grouped,
  now,
}: BrowserRowsInput): BrowserRow[] {
  if (view === 'all') {
    const sections: { kind: MediaKind; items: StoryMediaItem[] }[] = [
      { kind: 'image', items: images },
      { kind: 'video', items: videos },
      { kind: 'audio', items: audios },
    ];
    return sections.flatMap(({ kind, items }) => {
      if (!items.length) return [];
      const header: BrowserRow = {
        type: 'header',
        key: `kind-${kind}`,
        label: { source: 'kind', kind },
        count: items.length,
      };
      // A sound is never a square: the audio section keeps the track row it has
      // everywhere else, inside the same scroll as the grids above it.
      return [header, ...(kind === 'audio' ? trackRows(items, kind) : gridRows(items, columns, kind))];
    });
  }

  if (view === 'audio') {
    return buildAudioTrackRows(audios, grouped).map((row) => (row.type === 'header'
      ? {
        type: 'header',
        key: row.key,
        label: { source: 'category', category: row.category },
        count: row.count,
      }
      : { type: 'track', key: row.key, item: row.item }));
  }

  const items = view === 'image' ? images : videos;
  if (!grouped) return gridRows(items, columns, view);

  return groupMediaByDate(items, now).flatMap((group) => [
    {
      type: 'header',
      key: `date-${group.label}`,
      label: { source: 'date', label: group.label },
      count: group.items.length,
    } as BrowserRow,
    ...gridRows(group.items, columns, `date-${group.label}`),
  ]);
}

/**
 * `date` is the order the gallery already builds — newest first — and the only
 * one the date headers describe truthfully, so the screen drops those headers
 * under every other order rather than labelling a group it did not form.
 */
export function sortMediaItems(items: StoryMediaItem[], sort: MediaSort): StoryMediaItem[] {
  if (sort === 'date') return items;
  const sorted = items.slice();
  if (sort === 'name') {
    sorted.sort((left, right) => left.name.localeCompare(right.name));
    return sorted;
  }
  if (sort === 'size') {
    // A file whose size the library never recorded sorts last rather than as 0,
    // which would put every sprite of unknown weight above the real answers.
    sorted.sort((left, right) => (right.sizeBytes ?? -1) - (left.sizeBytes ?? -1));
    return sorted;
  }
  sorted.sort((left, right) => {
    const byUsage = (right.usage.enabled + right.usage.disabled) - (left.usage.enabled + left.usage.disabled);
    return byUsage !== 0 ? byUsage : right.addedAt - left.addedAt;
  });
  return sorted;
}
