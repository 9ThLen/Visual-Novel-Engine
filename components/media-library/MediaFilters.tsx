/**
 * The two rails above the grid: image/video tabs, then the filter row where
 * character portraits sit next to the usage filters.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ResolvedAssetImage } from '@/components/resolved-asset-image';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import type { CharacterMediaFilter, ImageFilter, MediaKind } from '@/lib/story-media-gallery';

export function sameFilter(a: ImageFilter, b: ImageFilter): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'character' && b.kind === 'character'
    ? a.characterId === b.characterId
    : true;
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

interface TabsProps {
  colors: ThemeColorPalette;
  kind: MediaKind;
  counts: { images: number; videos: number };
  onChange: (kind: MediaKind) => void;
}

export function MediaTypeTabs({ colors, kind, counts, onChange }: TabsProps) {
  const { t } = useI18n();
  return (
    <View style={[styles.tabs, { backgroundColor: colors.background }]}>
      {(['image', 'video'] as MediaKind[]).map((value) => {
        const active = value === kind;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.tab, active && { backgroundColor: colors['surface-1'] }]}
          >
            <Text style={[typeScale.label, { color: active ? colors.foreground : colors.muted }]}>
              {t(value === 'image' ? 'mediaLibrary.tab.images' : 'mediaLibrary.tab.videos')}
              {'  '}
              {value === 'image' ? counts.images : counts.videos}
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
  /** Empty for the video tab: the model does not tie clips to characters. */
  characters: CharacterMediaFilter[];
  onChange: (filter: ImageFilter) => void;
}

export function MediaFilterRail({ colors, filter, counts, characters, onChange }: FilterRailProps) {
  const { t } = useI18n();

  const chip = (value: ImageFilter, label: string, count: number, accent?: string, avatar?: React.ReactNode) => {
    const active = sameFilter(filter, value);
    return (
      <Pressable
        key={`${value.kind}:${value.kind === 'character' ? value.characterId : ''}`}
        onPress={() => onChange(value)}
        accessibilityRole="button"
        // Explicit, because the initials avatar contributes a stray letter to
        // the name a screen reader would otherwise compute from the children.
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors['surface-1'] : colors.background,
            borderColor: active ? accent ?? colors.primary : colors.border,
          },
        ]}
      >
        {avatar}
        <Text style={[typeScale.label, { color: active ? colors.foreground : colors.muted }]}>{label}</Text>
        <Text style={[typeScale.caption, { color: colors.muted }]}>{count}</Text>
      </Pressable>
    );
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {chip({ kind: 'all' }, t('mediaLibrary.filter.all'), counts.all)}
      {chip({ kind: 'used' }, t('mediaLibrary.filter.used'), counts.used)}
      {chip({ kind: 'unused' }, t('mediaLibrary.filter.unused'), counts.unused)}
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
  rail: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
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
