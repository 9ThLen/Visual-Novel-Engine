/**
 * One square in the media grid: an image or a video clip.
 *
 * The square used to be the whole tile, which made a wall of similar
 * backgrounds unreadable — nothing but the picture told two of them apart. The
 * caption under it carries the name and what the library knows about the file,
 * so the grid can be scanned rather than hovered one tile at a time.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ResolvedAssetImage } from '@/components/resolved-asset-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { formatBytes, formatDuration } from '@/lib/media-format';
import type { StoryMediaItem, UsageState } from '@/lib/story-media-gallery';

/** Name plus one metadata line, under the square. */
export const TILE_CAPTION_HEIGHT = 34;

interface TileProps {
  item: StoryMediaItem;
  /** Side of the square. The tile is this tall plus `TILE_CAPTION_HEIGHT`. */
  size: number;
  colors: ThemeColorPalette;
  selected: boolean;
  /**
   * Whether usage is known. "Unused" is a claim about the story's scenes, so
   * the mark stays off until they have been read — every file looks unused
   * until then.
   */
  usageState?: UsageState;
  onPress: (item: StoryMediaItem) => void;
}

export const MediaTile = React.memo(function MediaTile({
  item,
  size,
  colors,
  selected,
  usageState = 'pending',
  onPress,
}: TileProps) {
  const { t } = useI18n();
  const owner = item.owners[0];
  const accent = owner?.color || colors.primary;
  const kindLabel = t(`mediaLibrary.kind.${item.kind}`);
  const unused = usageState === 'ready' && item.usage.enabled + item.usage.disabled === 0;

  // Size identifies the file; duration is what a clip is actually measured in,
  // and it already has a badge on the square, so the caption does not repeat it.
  const meta = item.sizeBytes !== undefined ? formatBytes(item.sizeBytes) : null;

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={owner
        ? t('mediaLibrary.tile.labelWithCharacter', { kind: kindLabel, name: item.name, character: owner.characterName })
        : t('mediaLibrary.tile.label', { kind: kindLabel, name: item.name })}
      style={{ width: size }}
    >
      <View
        style={[
          styles.square,
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
          // handing an .mp4 to <Image> just renders an empty square. The name
          // used to be printed here because nothing else told two clips apart;
          // the caption says it now, so the square is left to the glyph.
          <View style={[styles.videoPlaceholder, { backgroundColor: colors.background }]}>
            <IconSymbol name="movie" size={28} color={colors.muted} />
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
        {item.durationSeconds !== undefined ? (
          <View style={styles.durationBadge}>
            <Text style={styles.duration}>{formatDuration(item.durationSeconds)}</Text>
          </View>
        ) : null}
        {owner ? <View style={[styles.ownerDot, { backgroundColor: accent }]} /> : null}
        {unused ? (
          <View style={[styles.unused, { backgroundColor: colors['warning-bg'], borderColor: colors.warning }]}>
            <Text style={[typeScale.micro, { color: colors.warning }]}>{t('mediaLibrary.tile.unused')}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.caption}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
        {meta ? <Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  square: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 2 },
  image: { width: '100%', height: '100%' },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  durationBadge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
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
  unused: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  caption: { height: TILE_CAPTION_HEIGHT, paddingTop: spacing.xs },
  name: { ...typeScale.caption },
  meta: { ...typeScale.micro, fontVariant: ['tabular-nums'] },
});
