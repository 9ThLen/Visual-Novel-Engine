/**
 * What the side panel shows when no file is selected.
 *
 * On a wide screen the inspector's column stood empty until the author clicked
 * something, which is most of the time the library is open. This is the panel's
 * resting state: what the story carries, what it weighs, and what nothing in it
 * points at — the one question an author opens this screen to answer that no
 * single file can.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ResolvedAssetImage } from '@/components/resolved-asset-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { formatDate } from '@/lib/format-date';
import { formatBytes } from '@/lib/media-format';
import type { StoryMediaSummary } from '@/lib/media-library-overview';
import type { MediaKind, StoryMediaItem, UsageState } from '@/lib/story-media-gallery';

const KIND_ICON: Record<MediaKind, 'image' | 'movie' | 'music'> = {
  image: 'image',
  video: 'movie',
  audio: 'music',
};

interface MediaOverviewPanelProps {
  summary: StoryMediaSummary;
  colors: ThemeColorPalette;
  usageState: UsageState;
  onAdd: () => void;
  /** Jumps the grid to the files nothing uses. */
  onShowUnused: () => void;
  onSelect: (item: StoryMediaItem) => void;
}

export function MediaOverviewPanel({
  summary,
  colors,
  usageState,
  onAdd,
  onShowUnused,
  onSelect,
}: MediaOverviewPanelProps) {
  const { t, language, pluralize } = useI18n();

  const segments: { kind: MediaKind; bytes: number; color: string }[] = [
    { kind: 'image', bytes: summary.bytes.image, color: colors.primary },
    { kind: 'video', bytes: summary.bytes.video, color: colors['lego-choice'] },
    { kind: 'audio', bytes: summary.bytes.audio, color: colors['lego-audio'] },
  ];
  const total = summary.bytes.total;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={[typeScale.sectionTitle, { color: colors.foreground }]}>
        {t('mediaLibrary.overview.title')}
      </Text>

      <View style={styles.section}>
        <View style={[styles.bar, { backgroundColor: colors['surface-2'] }]}>
          {total > 0
            ? segments.map((segment) => (segment.bytes > 0 ? (
              <View
                key={segment.kind}
                style={{ flex: segment.bytes, backgroundColor: segment.color }}
              />
            ) : null))
            : null}
        </View>
        {segments.map((segment) => (
          <View key={segment.kind} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: segment.color }]} />
            <Text style={[typeScale.caption, styles.legendLabel, { color: colors['foreground-secondary'] }]}>
              {t(`mediaLibrary.section.${segment.kind}`)}
            </Text>
            <Text style={[typeScale.micro, styles.legendCount, { color: colors.muted }]}>
              {summary.counts[segment.kind]}
            </Text>
            <Text style={[typeScale.caption, styles.legendBytes, { color: colors.muted }]}>
              {formatBytes(segment.bytes)}
            </Text>
          </View>
        ))}
        {summary.unsizedCount > 0 ? (
          // The bar is drawn from recorded sizes, and a sprite that never
          // entered the media library has none. Saying so beats a total that
          // quietly leaves files out.
          <Text style={[typeScale.micro, { color: colors.muted }]}>
            {t('mediaLibrary.overview.unsized', { count: summary.unsizedCount })}
          </Text>
        ) : null}
      </View>

      {usageState === 'ready' && summary.unused.count > 0 ? (
        <View style={[styles.callout, { backgroundColor: colors['warning-bg'], borderColor: colors.warning }]}>
          <Text style={[typeScale.body, { color: colors.foreground }]}>
            {t('mediaLibrary.overview.unused', {
              count: summary.unused.count,
              files: pluralize(
                summary.unused.count,
                t('mediaLibrary.overview.fileOne'),
                t('mediaLibrary.overview.fileFew'),
                t('mediaLibrary.overview.fileMany'),
              ),
              size: formatBytes(summary.unused.bytes),
            })}
          </Text>
          <Pressable
            onPress={onShowUnused}
            accessibilityRole="button"
            style={[styles.calloutAction, { borderColor: colors.warning }]}
          >
            <Text style={[typeScale.label, { color: colors.warning }]}>
              {t('mediaLibrary.overview.showUnused')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {summary.recent.length ? (
        <View style={styles.section}>
          <Text style={[typeScale.micro, styles.heading, { color: colors.muted }]}>
            {t('mediaLibrary.overview.recent')}
          </Text>
          {summary.recent.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={t('mediaLibrary.tile.label', {
                kind: t(`mediaLibrary.kind.${item.kind}`),
                name: item.name,
              })}
              style={styles.recentRow}
            >
              <View style={[styles.recentThumb, { backgroundColor: colors['surface-2'] }]}>
                {item.kind === 'image'
                  ? <ResolvedAssetImage thumbnail uri={item.uri} style={styles.recentImage} resizeMode="cover" />
                  : <IconSymbol name={KIND_ICON[item.kind]} size={16} color={colors.muted} />}
              </View>
              <Text numberOfLines={1} style={[typeScale.caption, styles.recentName, { color: colors.foreground }]}>
                {item.name}
              </Text>
              <Text style={[typeScale.micro, { color: colors.muted }]}>
                {formatDate(item.addedAt, language)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        style={[styles.addRow, { borderColor: colors['border-subtle'] }]}
      >
        <IconSymbol name="add" size={20} color={colors.primary} />
        <Text style={[typeScale.body, { color: colors.foreground }]}>
          {t('mediaLibrary.overview.add')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.xs },
  heading: { textTransform: 'uppercase', letterSpacing: 1, paddingBottom: spacing.xs },
  bar: { flexDirection: 'row', height: 10, borderRadius: radius.full, overflow: 'hidden', marginBottom: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { flex: 1 },
  legendCount: { fontVariant: ['tabular-nums'] },
  legendBytes: { fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'right' },

  callout: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  calloutAction: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    justifyContent: 'center',
  },

  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  recentThumb: {
    width: 40,
    height: 30,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentImage: { width: '100%', height: '100%' },
  recentName: { flex: 1 },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
