/**
 * The narrow-screen stand-in for the rail: the media type tabs, then the filter
 * row where character portraits (images) or the two audio categories sit next
 * to the usage filters.
 *
 * A phone has room for one column, so these two bands are what a screen too
 * narrow for `MediaRail` gets instead — the same three axes, laid sideways.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ResolvedAssetImage } from '@/components/resolved-asset-image';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import type { MediaView } from '@/lib/media-browser-rows';
import type {
  AudioCategory,
  CharacterMediaFilter,
  ImageFilter,
} from '@/lib/story-media-gallery';

export function sameFilter(a: ImageFilter, b: ImageFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'character' && b.kind === 'character') return a.characterId === b.characterId;
  if (a.kind === 'audioCategory' && b.kind === 'audioCategory') return a.category === b.category;
  return true;
}

/** Initials stand in for a character with no sprite to show yet. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

const TAB_LABELS: Record<MediaView, string> = {
  all: 'mediaLibrary.tab.all',
  image: 'mediaLibrary.tab.images',
  video: 'mediaLibrary.tab.videos',
  audio: 'mediaLibrary.tab.audio',
};

interface TabsProps {
  colors: ThemeColorPalette;
  kind: MediaView;
  /**
   * `all` is optional: the tabs are the narrow-screen stand-in for the rail,
   * and a caller that has no combined view to offer simply omits it.
   */
  counts: { all?: number; images: number; videos: number; audios: number };
  onChange: (kind: MediaView) => void;
}

export function MediaTypeTabs({ colors, kind, counts, onChange }: TabsProps) {
  const { t } = useI18n();
  const views: MediaView[] = counts.all === undefined
    ? ['image', 'video', 'audio']
    : ['all', 'image', 'video', 'audio'];
  return (
    <View style={[styles.tabs, { backgroundColor: colors.background }]}>
      {views.map((value) => {
        const active = value === kind;
        const count = value === 'all'
          ? counts.all ?? 0
          : value === 'image' ? counts.images : value === 'video' ? counts.videos : counts.audios;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.tab, active && { backgroundColor: colors['surface-1'] }]}
          >
            <Text style={[typeScale.label, { color: active ? colors.foreground : colors.muted }]}>
              {t(TAB_LABELS[value])}
              {'  '}
              {count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface FilterRailProps {
  colors: ThemeColorPalette;
  filter: ImageFilter;
  counts: { all: number; used: number; unused: number };
  /** Empty for the video and audio tabs: the model ties neither to characters. */
  characters: CharacterMediaFilter[];
  /**
   * Empty off the audio tab. Music and sound are the two roles a timeline has
   * for audio, so they are the audio tab's answer to the character chips.
   */
  audioCategories?: { category: AudioCategory; count: number }[];
  /**
   * Whether usage is known yet. While it is not, "used" and "unused" are not
   * two halves of the library — everything falls into "unused" because the
   * scenes have not been read — so the two filters are not offered.
   */
  usageReady: boolean;
  onChange: (filter: ImageFilter) => void;
}

export function MediaFilterRail({
  colors,
  filter,
  counts,
  characters,
  audioCategories = [],
  usageReady,
  onChange,
}: FilterRailProps) {
  const { t } = useI18n();

  const chip = (
    value: ImageFilter,
    label: string,
    count: number,
    accent?: string,
    avatar?: React.ReactNode,
    disabled = false,
  ) => {
    const active = sameFilter(filter, value);
    return (
      <Pressable
        key={`${value.kind}:${
          value.kind === 'character' ? value.characterId : value.kind === 'audioCategory' ? value.category : ''
        }`}
        onPress={() => onChange(value)}
        disabled={disabled}
        accessibilityRole="button"
        // Explicit, because the initials avatar contributes a stray letter to
        // the name a screen reader would otherwise compute from the children.
        accessibilityLabel={label}
        accessibilityState={{ selected: active, disabled }}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors['surface-1'] : colors.background,
            borderColor: active ? accent ?? colors.primary : colors.border,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {avatar}
        <Text style={[typeScale.label, { color: active ? colors.foreground : colors.muted }]}>{label}</Text>
        {disabled ? null : <Text style={[typeScale.caption, { color: colors.muted }]}>{count}</Text>}
      </Pressable>
    );
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.railScroll}
      contentContainerStyle={styles.rail}
    >
      {chip({ kind: 'all' }, t('mediaLibrary.filter.all'), counts.all)}
      {audioCategories.map(({ category, count }) => chip(
        { kind: 'audioCategory', category },
        t(`mediaLibrary.filter.${category}`),
        count,
      ))}
      {chip({ kind: 'used' }, t('mediaLibrary.filter.used'), counts.used, undefined, undefined, !usageReady)}
      {chip({ kind: 'unused' }, t('mediaLibrary.filter.unused'), counts.unused, undefined, undefined, !usageReady)}
      {characters.map((character) => chip(
        { kind: 'character', characterId: character.characterId },
        character.name,
        character.count,
        character.color,
        character.avatarUri
          ? <ResolvedAssetImage uri={character.avatarUri} style={styles.avatar} resizeMode="cover" />
          : (
            <View style={[styles.avatar, styles.initials, { backgroundColor: character.color || colors.primary }]}>
              <Text style={[typeScale.micro, { color: colors['foreground-inverse'] }]}>
                {initialsOf(character.name)}
              </Text>
            </View>
          ),
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', padding: 3, borderRadius: radius.md, gap: 3 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: radius.sm },
  // A ScrollView grows by default (flexGrow: 1), so in the library's column the
  // rail would take half the screen from the grid and stretch every chip down
  // with it. The rail is one row tall: it takes exactly the height it needs.
  railScroll: { flexGrow: 0, flexShrink: 0 },
  // Cross-axis centring keeps the chips at their own height even when the rail
  // is given more room than a single row.
  rail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  avatar: { width: 24, height: 24, borderRadius: radius.full },
  initials: { alignItems: 'center', justifyContent: 'center' },
});
