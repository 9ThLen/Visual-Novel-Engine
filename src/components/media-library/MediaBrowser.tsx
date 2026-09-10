/**
 * The one list the library browses through.
 *
 * There used to be two: a grid for pictures and a track list for sounds, and
 * the screen showed one or the other depending on the open tab. That is what
 * made a small story read as three empty rooms — you had to visit each to find
 * out it held four files.
 *
 * This renders both shapes from one virtualized list, so the "all" view can put
 * a grid of images, a grid of clips and a column of audio rows in a single
 * scroll. A sound never becomes a square on the way: the section for audio is
 * built from `AudioTrackRowView`, exactly as the audio view is.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  AudioTrackRowView,
  COMPACT_MAX_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  ROW_HEIGHT_COMPACT,
} from '@/components/media-library/AudioTrackRow';
import { MediaTile, TILE_CAPTION_HEIGHT } from '@/components/media-library/MediaTile';
import type { AudioPreviewState } from '@/hooks/useAudioPreview';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import {
  buildBrowserRows,
  type BrowserRow,
  type MediaView,
  type SectionLabel,
} from '@/lib/media-browser-rows';
import type { FolderDrag } from '@/hooks/use-folder-drag';
import type { StoryMediaItem, UsageState } from '@/lib/story-media-gallery';

/** Phone / tablet / desktop, matching the concept's 3 / 5 / 6-8 columns. */
export function getGalleryColumns(width: number): number {
  if (width >= 1440) return 8;
  if (width >= 1180) return 6;
  if (width >= 768) return 5;
  return 3;
}

const GAP = spacing.sm;
const SECTION_HEADER_HEIGHT = 40;

/**
 * How many tiles a row holds, for the width the browser is actually given.
 *
 * Exported because the screen needs the same answer: arrow-key navigation moves
 * by one row, and a row is however many tiles the grid drew.
 */
export function mediaBrowserColumns(width: number, reservedWidth: number, dense: boolean): number {
  const available = Math.max(240, width - reservedWidth - spacing.lg * 2);
  return getGalleryColumns(available) + (dense ? 2 : 0);
}

function headerText(label: SectionLabel): string {
  if (label.source === 'kind') return `mediaLibrary.section.${label.kind}`;
  if (label.source === 'category') return `mediaLibrary.audio.group.${label.category}`;
  return `mediaLibrary.group.${label.label}`;
}

/**
 * One row of tiles, and the gesture that carries them.
 *
 * The responder lives on the row rather than on each tile: a row already
 * re-renders as a unit, and which tile a drag started on is arithmetic on the
 * touch position rather than a prop every tile has to carry.
 */
function GridRow({
  items,
  height,
  tileSize,
  gap,
  drag,
  keysFor,
  children,
}: {
  items: StoryMediaItem[];
  height: number;
  tileSize: number;
  gap: number;
  drag?: FolderDrag;
  keysFor?: (item: StoryMediaItem) => string[];
  children: React.ReactNode;
}) {
  const rowRef = useRef<View | null>(null);
  /**
   * Where the row starts on screen. Measured on layout rather than on the
   * drag: a vertical scroll does not move it sideways, and the grant that
   * needs it is synchronous.
   */
  const originX = useRef(0);

  const resolve = useRef<(touchX: number) => string[] | null>(() => null);
  resolve.current = (touchX: number) => {
    const index = Math.floor((touchX - originX.current) / (tileSize + gap));
    const item = index >= 0 ? items[index] : undefined;
    return item && keysFor ? keysFor(item) : null;
  };

  // Stable for the life of the row: the responder reads through the ref, so a
  // re-render never rebuilds the gesture mid-drag.
  const responder = useMemo(
    () => drag?.createResponder((touchX) => resolve.current(touchX)),
    [drag],
  );

  return (
    <View
      ref={rowRef}
      onLayout={() => rowRef.current?.measureInWindow?.((x) => { originX.current = x; })}
      style={[styles.gridRow, { height }]}
      {...(responder?.panHandlers ?? {})}
    >
      {children}
    </View>
  );
}

interface MediaBrowserProps {
  view: MediaView;
  /** Already filtered, searched and ordered by the screen. */
  images: StoryMediaItem[];
  videos: StoryMediaItem[];
  audios: StoryMediaItem[];
  colors: ThemeColorPalette;
  selectedKey: string | null;
  /** False under a filter or a search, where one header would hold every row. */
  grouped: boolean;
  now: number;
  emptyLabel: string;
  usageState: UsageState;
  onSelect: (item: StoryMediaItem) => void;
  /**
   * Select mode. A press means "tick this" rather than "open this", which is
   * the screen's decision to make — the browser only reports the press and
   * draws the state it is handed.
   */
  picking?: boolean;
  checkedKeys?: ReadonlySet<string>;
  onLongPress?: (item: StoryMediaItem) => void;
  /** Reserved width taken by a side panel, so tiles size to what is left. */
  reservedWidth?: number;
  /** Extra tiles per row, for authors who would rather see more at once. */
  dense?: boolean;
  onTogglePlayback?: (item: StoryMediaItem) => void;
  activeAudioKey?: string | null;
  previewState?: AudioPreviewState;
  progress?: number;
  /** Absent where there is no rail to drop onto, which is every narrow screen. */
  drag?: FolderDrag;
  /** What a drag from this tile carries: the ticked set, or just this file. */
  keysForDrag?: (item: StoryMediaItem) => string[];
}

export function MediaBrowser({
  view,
  images,
  videos,
  audios,
  colors,
  selectedKey,
  grouped,
  now,
  emptyLabel,
  usageState,
  onSelect,
  picking = false,
  checkedKeys,
  onLongPress,
  reservedWidth = 0,
  dense = false,
  onTogglePlayback,
  activeAudioKey = null,
  previewState = 'loading',
  progress = 0,
  drag,
  keysForDrag,
}: MediaBrowserProps) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();

  const available = Math.max(240, width - reservedWidth - spacing.lg * 2);
  const columns = mediaBrowserColumns(width, reservedWidth, dense);
  const tileSize = Math.floor((available - GAP * (columns - 1)) / columns);
  const gridRowHeight = tileSize + TILE_CAPTION_HEIGHT + GAP;
  const compact = available < COMPACT_MAX_WIDTH;
  const trackRowHeight = compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT;

  const rows = useMemo(
    () => buildBrowserRows({ view, images, videos, audios, columns, grouped, now }),
    [audios, columns, grouped, images, now, videos, view],
  );

  const heightOf = useCallback((row: BrowserRow | undefined) => {
    if (!row) return 0;
    if (row.type === 'header') return row.label.source === 'kind' ? SECTION_HEADER_HEIGHT : HEADER_HEIGHT;
    return row.type === 'grid' ? gridRowHeight : trackRowHeight;
  }, [gridRowHeight, trackRowHeight]);

  const getItemLayout = useCallback((data: ArrayLike<BrowserRow> | null | undefined, index: number) => {
    let offset = 0;
    for (let cursor = 0; cursor < index; cursor += 1) offset += heightOf(data?.[cursor]);
    return { length: heightOf(data?.[index]), offset, index };
  }, [heightOf]);

  const renderItem = useCallback(({ item: row }: { item: BrowserRow }) => {
    if (row.type === 'header') {
      return (
        <View style={[styles.header, { height: heightOf(row) }]}>
          <Text style={[styles.headerLabel, { color: colors.muted }]}>{t(headerText(row.label))}</Text>
          <Text style={[styles.headerCount, { color: colors.muted }]}>{row.count}</Text>
          <View style={[styles.headerRule, { backgroundColor: colors['border-subtle'] }]} />
        </View>
      );
    }

    if (row.type === 'track') {
      return (
        <AudioTrackRowView
          item={row.item}
          colors={colors}
          compact={compact}
          selected={row.item.key === selectedKey}
          usageState={usageState}
          onSelect={onSelect}
          onLongPress={onLongPress}
          picking={picking}
          checked={checkedKeys?.has(row.item.key) ?? false}
          onTogglePlayback={onTogglePlayback}
          previewState={row.item.key === activeAudioKey ? previewState : null}
          // Only the active row draws a fill, so the rest stay memo-stable
          // while it ticks.
          progress={row.item.key === activeAudioKey ? progress : 0}
        />
      );
    }

    return (
      <GridRow
        items={row.items}
        height={gridRowHeight}
        tileSize={tileSize}
        gap={GAP}
        drag={drag}
        keysFor={keysForDrag}
      >
        {row.items.map((item) => (
          <MediaTile
            key={item.key}
            item={item}
            size={tileSize}
            colors={colors}
            selected={item.key === selectedKey}
            usageState={usageState}
            picking={picking}
            checked={checkedKeys?.has(item.key) ?? false}
            onPress={onSelect}
            onLongPress={onLongPress}
          />
        ))}
      </GridRow>
    );
  }, [
    activeAudioKey,
    checkedKeys,
    colors,
    compact,
    drag,
    gridRowHeight,
    heightOf,
    keysForDrag,
    onLongPress,
    onSelect,
    onTogglePlayback,
    picking,
    previewState,
    progress,
    selectedKey,
    t,
    tileSize,
    usageState,
  ]);

  if (!rows.length) {
    return <Text style={[styles.empty, { color: colors.muted }]}>{emptyLabel}</Text>;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      removeClippedSubviews
      initialNumToRender={8}
      windowSize={5}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  gridRow: { flexDirection: 'row', gap: GAP },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  headerLabel: { ...typeScale.caption, textTransform: 'uppercase', letterSpacing: 1 },
  headerCount: { ...typeScale.micro },
  headerRule: { flex: 1, height: 1, borderRadius: radius.full },
  empty: { ...typeScale.body, paddingVertical: spacing.xl },
});
