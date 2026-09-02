/**
 * The library's left rail: sources, characters and state, stacked.
 *
 * These used to be one horizontal row of chips above the grid, which put two
 * unrelated questions — "which kind of file" and "whose is it" — on the same
 * line, and hid the eighth character behind a sideways scroll nobody looks for.
 * Down the side each axis gets its own heading, and the character list grows
 * downward, where there is room for it.
 *
 * Narrow screens have no room for a column, so the screen falls back to the
 * tabs and chip row in `MediaFilters` there; this rail is the wide-screen shape.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { initialsOf, sameFilter } from '@/components/media-library/MediaFilters';
import { ResolvedAssetImage } from '@/components/resolved-asset-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { formatBytes } from '@/lib/media-format';
import type { MediaView } from '@/lib/media-browser-rows';
import type { AudioCategory, CharacterMediaFilter, ImageFilter } from '@/lib/story-media-gallery';

export const MEDIA_RAIL_WIDTH = 236;
/** Icons and counts only, for a screen wide enough for a rail but not a wide one. */
export const MEDIA_RAIL_COLLAPSED_WIDTH = 72;

const SOURCES: { view: MediaView; label: string; icon: 'gallery' | 'image' | 'movie' | 'music' }[] = [
  { view: 'all', label: 'mediaLibrary.tab.all', icon: 'gallery' },
  { view: 'image', label: 'mediaLibrary.tab.images', icon: 'image' },
  { view: 'video', label: 'mediaLibrary.tab.videos', icon: 'movie' },
  { view: 'audio', label: 'mediaLibrary.tab.audio', icon: 'music' },
];

interface MediaRailProps {
  colors: ThemeColorPalette;
  view: MediaView;
  viewCounts: { all: number; images: number; videos: number; audios: number };
  onChangeView: (view: MediaView) => void;
  filter: ImageFilter;
  filterCounts: { all: number; used: number; unused: number };
  onChangeFilter: (filter: ImageFilter) => void;
  /** Empty off the image and combined views: clips and sounds have no owner. */
  characters: CharacterMediaFilter[];
  /** Empty off the audio view. The two roles a timeline plays a sound in. */
  audioCategories?: { category: AudioCategory; count: number }[];
  /**
   * Whether usage is known yet. While it is not, "used" and "unused" are not
   * two halves of the library — everything falls into "unused" because the
   * scenes have not been read — so neither is offered.
   */
  usageReady: boolean;
  /** Total of the files whose size the library recorded. */
  totalBytes: number;
  /** How many it could not weigh, so the footer can stop short of claiming. */
  unsizedCount: number;
  collapsed?: boolean;
}

export function MediaRail({
  colors,
  view,
  viewCounts,
  onChangeView,
  filter,
  filterCounts,
  onChangeFilter,
  characters,
  audioCategories = [],
  usageReady,
  totalBytes,
  unsizedCount,
  collapsed = false,
}: MediaRailProps) {
  const { t } = useI18n();

  const item = (options: {
    key: string;
    label: string;
    count: number;
    active: boolean;
    onPress: () => void;
    role: 'tab' | 'button';
    disabled?: boolean;
    icon?: React.ReactNode;
  }) => (
    <Pressable
      key={options.key}
      onPress={options.onPress}
      disabled={options.disabled}
      accessibilityRole={options.role}
      // Explicit, because an avatar's initials would otherwise join the name a
      // screen reader computes from the children.
      accessibilityLabel={options.label}
      accessibilityState={{ selected: options.active, disabled: options.disabled }}
      style={[
        styles.item,
        collapsed && styles.itemCollapsed,
        {
          backgroundColor: options.active ? colors.selected : 'transparent',
          opacity: options.disabled ? 0.5 : 1,
        },
      ]}
    >
      {options.icon}
      {collapsed ? null : (
        <Text
          numberOfLines={1}
          style={[
            typeScale.label,
            styles.itemLabel,
            { color: options.active ? colors.foreground : colors['foreground-secondary'] },
          ]}
        >
          {options.label}
        </Text>
      )}
      {options.disabled ? null : (
        <Text style={[typeScale.micro, styles.count, { color: colors.muted }]}>{options.count}</Text>
      )}
    </Pressable>
  );

  const heading = (label: string) => (
    <Text style={[typeScale.micro, styles.heading, { color: colors.muted }]}>{t(label)}</Text>
  );

  const avatar = (character: CharacterMediaFilter) => (character.avatarUri
    ? <ResolvedAssetImage uri={character.avatarUri} style={styles.avatar} resizeMode="cover" />
    : (
      <View style={[styles.avatar, styles.initials, { backgroundColor: character.color || colors.primary }]}>
        <Text style={[typeScale.micro, { color: colors['foreground-inverse'] }]}>
          {initialsOf(character.name)}
        </Text>
      </View>
    ));

  return (
    <View
      style={[
        styles.rail,
        {
          width: collapsed ? MEDIA_RAIL_COLLAPSED_WIDTH : MEDIA_RAIL_WIDTH,
          backgroundColor: colors.surface,
          borderRightColor: colors['border-subtle'],
        },
      ]}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.group}>
          {heading('mediaLibrary.rail.sources')}
          {SOURCES.map((source) => item({
            key: source.view,
            label: t(source.label),
            count: source.view === 'all'
              ? viewCounts.all
              : source.view === 'image'
                ? viewCounts.images
                : source.view === 'video' ? viewCounts.videos : viewCounts.audios,
            active: source.view === view,
            onPress: () => onChangeView(source.view),
            role: 'tab',
            icon: (
              <IconSymbol
                name={source.icon}
                size={20}
                color={source.view === view ? colors.primary : colors.muted}
              />
            ),
          }))}
        </View>

        {audioCategories.length ? (
          <View style={styles.group}>
            {heading('mediaLibrary.rail.category')}
            {audioCategories.map(({ category, count }) => item({
              key: category,
              label: t(`mediaLibrary.filter.${category}`),
              count,
              active: sameFilter(filter, { kind: 'audioCategory', category }),
              onPress: () => onChangeFilter({ kind: 'audioCategory', category }),
              role: 'button',
              icon: (
                <IconSymbol
                  name={category === 'music' ? 'music' : 'sound'}
                  size={20}
                  color={sameFilter(filter, { kind: 'audioCategory', category })
                    ? colors['lego-audio']
                    : colors.muted}
                />
              ),
            }))}
          </View>
        ) : null}

        {characters.length ? (
          <View style={styles.group}>
            {heading('mediaLibrary.rail.characters')}
            {characters.map((character) => item({
              key: character.characterId,
              label: character.name,
              count: character.count,
              active: sameFilter(filter, { kind: 'character', characterId: character.characterId }),
              onPress: () => onChangeFilter({ kind: 'character', characterId: character.characterId }),
              role: 'button',
              icon: avatar(character),
            }))}
          </View>
        ) : null}

        <View style={styles.group}>
          {heading('mediaLibrary.rail.state')}
          {item({
            key: 'all',
            label: t('mediaLibrary.filter.all'),
            count: filterCounts.all,
            active: filter.kind === 'all',
            onPress: () => onChangeFilter({ kind: 'all' }),
            role: 'button',
            icon: <IconSymbol name="list" size={20} color={filter.kind === 'all' ? colors.primary : colors.muted} />,
          })}
          {item({
            key: 'used',
            label: t('mediaLibrary.filter.used'),
            count: filterCounts.used,
            active: filter.kind === 'used',
            onPress: () => onChangeFilter({ kind: 'used' }),
            role: 'button',
            disabled: !usageReady,
            icon: <IconSymbol name="checkmark" size={20} color={filter.kind === 'used' ? colors.success : colors.muted} />,
          })}
          {item({
            key: 'unused',
            label: t('mediaLibrary.filter.unused'),
            count: filterCounts.unused,
            active: filter.kind === 'unused',
            onPress: () => onChangeFilter({ kind: 'unused' }),
            role: 'button',
            disabled: !usageReady,
            icon: <IconSymbol name="unused" size={20} color={filter.kind === 'unused' ? colors.warning : colors.muted} />,
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors['border-subtle'] }]}>
        <Text numberOfLines={2} style={[typeScale.micro, { color: colors.muted }]}>
          {/* A story whose sprites never entered the media library has files with
              no recorded size, and a total that silently leaves them out is a
              wrong number rather than a rounded one. */}
          {unsizedCount > 0
            ? t('mediaLibrary.rail.storageApprox', { size: formatBytes(totalBytes) })
            : t('mediaLibrary.rail.storage', { size: formatBytes(totalBytes) })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { borderRightWidth: 1 },
  scroll: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, gap: spacing.lg },
  group: { gap: 2 },
  heading: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  itemCollapsed: { flexDirection: 'column', gap: 2, paddingVertical: spacing.xs, minHeight: 52 },
  itemLabel: { flex: 1 },
  count: { fontVariant: ['tabular-nums'] },
  avatar: { width: 22, height: 22, borderRadius: radius.full },
  initials: { alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
