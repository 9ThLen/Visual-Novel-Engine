/**
 * The audio track list.
 *
 * Audio used to render through `MediaGrid`, which is built around a square
 * whose contents *are* the picture. A sound has no picture, so the square came
 * out as an empty box with a note in it, and everything the library already
 * knew about the file — how long, how big, what format, where it plays — was
 * reachable only one file at a time through the inspector.
 *
 * A row is the shape that fits: it takes the width a wide screen actually has,
 * and it has somewhere to put the paperwork. The rail on the right of the name
 * is the file's timeline, filled for the file the screen's one preview
 * controller is on; it is where the waveform lands once peaks are computed.
 */

import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { AudioPreviewState } from '@/hooks/useAudioPreview';
import { useI18n } from '@/hooks/use-i18n';
import { formatDate } from '@/lib/format-date';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import {
  audioFormatLabel,
  audioUsageBadge,
  buildAudioTrackRows,
  type AudioTrackRow,
} from '@/lib/audio-track-rows';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { formatBytes, formatDuration } from '@/lib/media-format';
import type { StoryMediaItem, UsageState } from '@/lib/story-media-gallery';

/** Below this the row stacks: name over rail over badges. */
const COMPACT_MAX_WIDTH = 720;

const ROW_HEIGHT = 64;
const ROW_HEIGHT_COMPACT = 104;
const HEADER_HEIGHT = 40;
const DISC_SIZE = 44;

interface TrackRowProps {
  item: StoryMediaItem;
  colors: ThemeColorPalette;
  compact: boolean;
  selected: boolean;
  usageState: UsageState;
  onSelect: (item: StoryMediaItem) => void;
  onTogglePlayback?: (item: StoryMediaItem) => void;
  /** What the one preview controller is doing, when it is on this item. */
  previewState?: AudioPreviewState | null;
  /** 0–1 through the track; only read while the controller is on this item. */
  progress?: number;
}

export const AudioTrackRowView = React.memo(function AudioTrackRowView({
  item,
  colors,
  compact,
  selected,
  usageState,
  onSelect,
  onTogglePlayback,
  previewState = null,
  progress = 0,
}: TrackRowProps) {
  const { t, pluralize, language } = useI18n();
  const music = item.audioCategory === 'music';
  /**
   * The two roles get the two colours the editor already paints them in: the
   * timeline's audio block is `lego-audio`, and nothing else on this screen
   * uses it, so music reads as itself at a glance.
   */
  const accent = music ? colors['lego-audio'] : colors.primary;
  /**
   * Three things one button can mean, and the label has to say which: pause a
   * sound that is playing, resume one that is paused, and — while the file is
   * still being resolved — call the whole attempt off.
   */
  const transport = previewState === 'playing'
    ? 'pause'
    : previewState === 'loading' ? 'stop' : 'play';

  // Format, size and date, in that order: the first two identify the file, the
  // last one places it. Any of them can be missing, and a lone separator would
  // be worse than a shorter line.
  const source = [
    audioFormatLabel(item),
    item.sizeBytes !== undefined ? formatBytes(item.sizeBytes) : null,
    formatDate(item.addedAt, language),
  ].filter(Boolean).join('  ·  ');

  const badge = audioUsageBadge(item, usageState);
  const usageLabel = badge.kind === 'used'
    ? t('mediaLibrary.audio.usage.used', {
        count: badge.count,
        scenes: pluralize(
          badge.count,
          t('mediaLibrary.audio.sceneOne'),
          t('mediaLibrary.audio.sceneFew'),
          t('mediaLibrary.audio.sceneMany'),
        ),
      })
    : t(`mediaLibrary.audio.usage.${badge.kind}`);
  const usageColor = badge.kind === 'used' ? colors.success : colors.muted;

  const name = (
    <View style={styles.nameBlock}>
      <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
      <Text numberOfLines={1} style={[styles.source, { color: colors.muted }]}>{source}</Text>
    </View>
  );

  const duration = (
    <Text style={[styles.duration, { color: colors['foreground-secondary'] }]}>
      {item.durationSeconds !== undefined ? formatDuration(item.durationSeconds) : '--:--'}
    </Text>
  );

  // The rail is the file's timeline whether or not it is sounding: an empty one
  // says "there is a length here", which is what the row's shape promises. Only
  // the active file's is filled.
  const rail = (
    <View style={[styles.rail, { backgroundColor: colors['border-subtle'] }]}>
      {previewState ? (
        <View
          style={[
            styles.railFill,
            { backgroundColor: accent, width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` },
          ]}
        />
      ) : null}
    </View>
  );

  const badges = (
    <View style={styles.badges}>
      {music && item.audioLoop ? (
        <View style={[styles.badge, { borderColor: accent }]}>
          <IconSymbol name="loop" size={12} color={accent} />
          <Text style={[styles.badgeText, { color: accent }]}>{t('mediaLibrary.audio.loop')}</Text>
        </View>
      ) : null}
      <View style={[
        styles.badge,
        { borderColor: badge.kind === 'used' ? colors.success : colors['border-subtle'] },
      ]}>
        <Text style={[styles.badgeText, { color: usageColor }]}>{usageLabel}</Text>
      </View>
    </View>
  );

  return (
    <View style={{ height: compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT }}>
      <Pressable
        onPress={() => onSelect(item)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={t('mediaLibrary.tile.label', {
          kind: t(`mediaLibrary.kind.${item.kind}`),
          name: item.name,
        })}
        style={[
          styles.row,
          compact ? styles.rowCompact : styles.rowWide,
          {
            backgroundColor: selected ? colors['surface-1'] : 'transparent',
            borderColor: selected ? accent : 'transparent',
          },
        ]}
      >
        {compact ? (
          <>
            <View style={styles.compactTop}>
              {name}
              {duration}
            </View>
            {rail}
            {badges}
          </>
        ) : (
          <>
            {name}
            <View style={styles.railColumn}>{rail}</View>
            {duration}
            {badges}
          </>
        )}
      </Pressable>

      {onTogglePlayback ? (
        // A sibling of the row, not a child of it: a button inside a button is
        // one control to a screen reader and invalid markup on web.
        <View style={styles.discSlot} pointerEvents="box-none">
          <Pressable
            onPress={() => onTogglePlayback(item)}
            accessibilityRole="button"
            accessibilityLabel={t(`mediaLibrary.audio.${transport}`, { name: item.name })}
            style={[
              styles.disc,
              {
                borderColor: accent,
                backgroundColor: previewState === 'playing' ? accent : 'transparent',
              },
            ]}
          >
            <IconSymbol
              name={transport}
              size={20}
              color={previewState === 'playing' ? colors['foreground-on-primary'] : accent}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

interface AudioTrackListProps {
  items: StoryMediaItem[];
  colors: ThemeColorPalette;
  selectedKey: string | null;
  /** False under a filter or a search, where one header would hold every row. */
  grouped: boolean;
  emptyLabel: string;
  usageState: UsageState;
  onSelect: (item: StoryMediaItem) => void;
  onTogglePlayback?: (item: StoryMediaItem) => void;
  /** Width taken by a docked inspector, so the rows lay out in what is left. */
  reservedWidth?: number;
  /** The item the one preview controller is on, and what it is doing there. */
  activeAudioKey?: string | null;
  previewState?: AudioPreviewState;
  progress?: number;
}

export function AudioTrackList({
  items,
  colors,
  selectedKey,
  grouped,
  emptyLabel,
  usageState,
  onSelect,
  onTogglePlayback,
  reservedWidth = 0,
  activeAudioKey = null,
  previewState = 'loading',
  progress = 0,
}: AudioTrackListProps) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const compact = width - reservedWidth < COMPACT_MAX_WIDTH;
  const rowHeight = compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT;

  const rows = useMemo(() => buildAudioTrackRows(items, grouped), [grouped, items]);

  const getItemLayout = useCallback((data: ArrayLike<AudioTrackRow> | null | undefined, index: number) => {
    let offset = 0;
    for (let cursor = 0; cursor < index; cursor += 1) {
      offset += data?.[cursor]?.type === 'header' ? HEADER_HEIGHT : rowHeight;
    }
    const length = data?.[index]?.type === 'header' ? HEADER_HEIGHT : rowHeight;
    return { length, offset, index };
  }, [rowHeight]);

  const renderItem = useCallback(({ item: row }: { item: AudioTrackRow }) => {
    if (row.type === 'header') {
      return (
        <View style={[styles.groupHeader, { height: HEADER_HEIGHT }]}>
          <Text style={[styles.groupLabel, { color: colors.muted }]}>
            {t(`mediaLibrary.audio.group.${row.category}`)}
          </Text>
          <Text style={[styles.groupCount, { color: colors.muted }]}>{row.count}</Text>
          <View style={[styles.groupRule, { backgroundColor: colors['border-subtle'] }]} />
        </View>
      );
    }
    return (
      <AudioTrackRowView
        item={row.item}
        colors={colors}
        compact={compact}
        selected={row.item.key === selectedKey}
        usageState={usageState}
        onSelect={onSelect}
        onTogglePlayback={onTogglePlayback}
        previewState={row.item.key === activeAudioKey ? previewState : null}
        // Only the active row draws a fill, so the rest stay memo-stable while
        // it ticks.
        progress={row.item.key === activeAudioKey ? progress : 0}
      />
    );
  }, [
    activeAudioKey,
    colors,
    compact,
    onSelect,
    onTogglePlayback,
    previewState,
    progress,
    selectedKey,
    t,
    usageState,
  ]);

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
      initialNumToRender={10}
      windowSize={5}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  groupLabel: { ...typeScale.caption, textTransform: 'uppercase', letterSpacing: 1 },
  groupCount: { ...typeScale.micro },
  groupRule: { flex: 1, height: 1 },

  row: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    // The disc sits in this gutter, as a sibling rather than a child.
    paddingLeft: DISC_SIZE + spacing.md,
    paddingRight: spacing.md,
  },
  rowWide: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  rowCompact: { justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  compactTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  discSlot: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' },
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  nameBlock: { flex: 2, minWidth: 0 },
  name: { ...typeScale.label },
  source: { ...typeScale.micro, marginTop: 2 },

  railColumn: { flex: 3, justifyContent: 'center' },
  rail: { height: 4, borderRadius: radius.full, overflow: 'hidden' },
  railFill: { height: 4, borderRadius: radius.full },

  duration: { ...typeScale.caption, fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' },

  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { ...typeScale.micro },

  empty: { ...typeScale.body, paddingVertical: spacing.xl },
});
