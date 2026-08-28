/**
 * The media grid: images and video clips. Audio has its own list — a square is
 * the wrong shape for a file with no picture in it.
 *
 * `numColumns` on FlatList cannot coexist with sections and SectionList has no
 * `numColumns`, so the data is pre-chunked into rows here and rendered as one
 * flat virtualized list of headers and rows. Row height is known up front,
 * which is what lets `getItemLayout` skip measurement entirely.
 */

import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ResolvedAssetImage } from '@/components/resolved-asset-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { formatDuration } from '@/lib/media-format';
import {
  groupMediaByDate,
  type DateGroupLabel,
  type StoryMediaItem,
} from '@/lib/story-media-gallery';

/** Phone / tablet / desktop, matching the concept's 3 / 5 / 6-8 columns. */
export function getGalleryColumns(width: number): number {
  if (width >= 1440) return 8;
  if (width >= 1180) return 6;
  if (width >= 768) return 5;
  return 3;
}

const GAP = spacing.xs;

export type GridRow =
  | { type: 'header'; key: string; label: DateGroupLabel }
  | { type: 'row'; key: string; items: StoryMediaItem[] };

function chunk(items: StoryMediaItem[], size: number): StoryMediaItem[][] {
  const rows: StoryMediaItem[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

/**
 * @param grouped when false the items render as one uninterrupted grid. Date
 * headers only earn their space in the unfiltered view; under a character or
 * usage filter they degenerate into groups of one or two tiles.
 */
export function buildGridRows(
  items: StoryMediaItem[],
  columns: number,
  grouped: boolean,
  now: number,
): GridRow[] {
  if (!grouped) {
    return chunk(items, columns).map((row, index) => ({ type: 'row', key: `row-${index}`, items: row }));
  }

  return groupMediaByDate(items, now).flatMap((group) => [
    { type: 'header', key: `header-${group.label}`, label: group.label } as GridRow,
    ...chunk(group.items, columns).map((row, index) => ({
      type: 'row' as const,
      key: `row-${group.label}-${index}`,
      items: row,
    })),
  ]);
}

interface TileProps {
  item: StoryMediaItem;
  size: number;
  colors: ThemeColorPalette;
  selected: boolean;
  onPress: (item: StoryMediaItem) => void;
}

export const MediaTile = React.memo(function MediaTile({
  item,
  size,
  colors,
  selected,
  onPress,
}: TileProps) {
  const { t } = useI18n();
  const owner = item.owners[0];
  const accent = owner?.color || colors.primary;
  const kindLabel = t(`mediaLibrary.kind.${item.kind}`);

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={owner
        ? t('mediaLibrary.tile.labelWithCharacter', { kind: kindLabel, name: item.name, character: owner.characterName })
        : t('mediaLibrary.tile.label', { kind: kindLabel, name: item.name })}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          backgroundColor: colors['surface-1'],
          borderColor: selected ? accent : 'transparent',
        },
      ]}
    >
      {item.kind === 'video' ? (
        // A clip has no still frame to show: the asset carries no poster, and
        // handing an .mp4 to <Image> just renders an empty square. The name is
        // the only thing that tells two clips apart in a grid.
        <View style={[styles.videoPlaceholder, { backgroundColor: colors.background }]}>
          <IconSymbol name="play" size={28} color={colors.muted} />
          <Text numberOfLines={2} style={[styles.videoName, { color: colors.muted }]}>{item.name}</Text>
        </View>
      ) : (
        <ResolvedAssetImage
          thumbnail
          uri={item.uri}
          style={styles.image}
          // Sprites are cut-outs whose shape carries the meaning; wide
          // backgrounds read better filling the square than letterboxed in it.
          resizeMode={item.owners.length ? 'contain' : 'cover'}
        />
      )}
      {item.kind !== 'image' && item.durationSeconds !== undefined ? (
        <View style={styles.videoBadge}>
          <Text style={styles.duration}>{formatDuration(item.durationSeconds)}</Text>
        </View>
      ) : null}
      {owner ? <View style={[styles.ownerDot, { backgroundColor: accent }]} /> : null}
    </Pressable>
  );
});

interface MediaGridProps {
  items: StoryMediaItem[];
  colors: ThemeColorPalette;
  selectedKey: string | null;
  grouped: boolean;
  now: number;
  emptyLabel: string;
  onSelect: (item: StoryMediaItem) => void;
  /** Reserved width taken by a side inspector, so tiles size to what is left. */
  reservedWidth?: number;
}

export function MediaGrid({
  items,
  colors,
  selectedKey,
  grouped,
  now,
  emptyLabel,
  onSelect,
  reservedWidth = 0,
}: MediaGridProps) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const available = Math.max(240, width - reservedWidth - spacing.lg * 2);
  const columns = getGalleryColumns(available);
  const tileSize = Math.floor((available - GAP * (columns - 1)) / columns);
  const rowHeight = tileSize + GAP;
  const headerHeight = 36;

  const rows = useMemo(
    () => buildGridRows(items, columns, grouped, now),
    [columns, grouped, items, now],
  );

  const getItemLayout = useCallback((data: ArrayLike<GridRow> | null | undefined, index: number) => {
    let offset = 0;
    for (let cursor = 0; cursor < index; cursor += 1) {
      offset += data?.[cursor]?.type === 'header' ? headerHeight : rowHeight;
    }
    const length = data?.[index]?.type === 'header' ? headerHeight : rowHeight;
    return { length, offset, index };
  }, [rowHeight]);

  const renderItem = useCallback(({ item: row }: { item: GridRow }) => {
    if (row.type === 'header') {
      return (
        <Text style={[styles.groupLabel, { color: colors.muted, height: headerHeight }]}>
          {t(`mediaLibrary.group.${row.label}`)}
        </Text>
      );
    }
    return (
      <View style={[styles.row, { height: rowHeight }]}>
        {row.items.map((item) => (
          <MediaTile
            key={item.key}
            item={item}
            size={tileSize}
            colors={colors}
            selected={item.key === selectedKey}
            onPress={onSelect}
          />
        ))}
      </View>
    );
  }, [colors, onSelect, rowHeight, selectedKey, t, tileSize]);

  if (!items.length) {
    return <Text style={[styles.empty, { color: colors.muted }]}>{emptyLabel}</Text>;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      removeClippedSubviews
      initialNumToRender={6}
      windowSize={5}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  row: { flexDirection: 'row', gap: GAP },
  groupLabel: { ...typeScale.caption, textTransform: 'uppercase', paddingTop: spacing.md, paddingBottom: spacing.xs },
  tile: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 2 },
  image: { width: '100%', height: '100%' },
  videoPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm },
  videoName: { ...typeScale.caption, textAlign: 'center' },
  videoBadge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  duration: { ...typeScale.micro, color: '#ffffff' },
  ownerDot: {
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  empty: { ...typeScale.body, paddingVertical: spacing.xl },
});
