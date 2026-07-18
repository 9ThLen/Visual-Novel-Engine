/**
 * A project card for the Story Editor. Each story gets a small cover (real
 * thumbnail or the same warm seeded poster the showcase uses, so the two
 * screens feel like one product), a scene-count pill, and quiet actions.
 *
 * Uses useColors() — this is an author-facing screen and must follow the
 * editor's theme, unlike the always-dark showcase.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ShowcaseImage } from '@/components/showcase/ShowcaseImage';
import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha } from '@/lib/_core/theme';
import { posterFallbackForSeed } from '@/lib/showcase/story-showcase';
import type { StoryMetadata } from '@/lib/story-domain';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export interface EditorStoryCardProps {
  story: StoryMetadata;
  onEdit: (story: StoryMetadata) => void;
  onDelete: (storyId: string) => void;
}

export const EditorStoryCard = memo(function EditorStoryCard({
  story,
  onEdit,
  onDelete,
}: EditorStoryCardProps) {
  const colors = useColors();
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);

  const fallback = useMemo(() => posterFallbackForSeed(story.id), [story.id]);
  const initial = story.title.trim().charAt(0).toUpperCase() || '?';
  const tags = (story.tags ?? []).slice(0, 3);

  const handleEdit = useCallback(() => onEdit(story), [onEdit, story]);
  const handleDelete = useCallback(() => onDelete(story.id), [onDelete, story.id]);

  const hoverProps =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {};

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: hovered ? withAlpha(colors.primary, 0.55) : colors.border,
        },
        hovered && Platform.OS === 'web' ? styles.cardHover : null,
      ]}
    >
      {/* The clickable region — cover + info. Actions live OUTSIDE it so we never
          nest an interactive control inside another (invalid HTML on web). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={story.title}
        onPress={handleEdit}
        {...hoverProps}
        style={styles.hitArea}
      >
        <View style={[styles.cover, { backgroundColor: fallback.bg }]}>
          <Text style={[styles.coverInitial, { color: fallback.ink }]}>{initial}</Text>
          <View
            style={[styles.coverBorder, { borderColor: withAlpha(fallback.ink, 0.18) }]}
            pointerEvents="none"
          />
          {story.thumbnailUri ? (
            <ShowcaseImage assetRef={story.thumbnailUri} style={styles.coverImage} resizeMode="cover" />
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {story.title}
          </Text>

          <View style={styles.metaRow}>
            <View style={[styles.pill, { backgroundColor: withAlpha(colors.secondary, 0.16) }]}>
              <Text style={[styles.pillText, { color: colors.secondary }]}>
                {t('editor.sceneCount', { count: story.sceneCount })}
              </Text>
            </View>
            <Text style={[styles.updated, { color: colors.muted }]} numberOfLines={1}>
              {t('common.updated')} {dateFormatter.format(new Date(story.updatedAt))}
            </Text>
          </View>

          {tags.length > 0 ? (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <View key={tag} style={[styles.tag, { borderColor: colors.border }]}>
                  <Text style={[styles.tagText, { color: colors.muted }]} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Button variant="primary" size="sm" onPress={handleEdit}>
          {t('common.edit')}
        </Button>
        <Button variant="ghost" size="sm" onPress={handleDelete}>
          {t('common.delete')}
        </Button>
      </View>
    </View>
  );
});

const COVER_WIDTH = 76;
const COVER_HEIGHT = Math.round((COVER_WIDTH * 3) / 2);

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    ...(Platform.OS === 'web' ? ({ transitionProperty: 'border-color, transform', transitionDuration: '160ms' } as object) : null),
  },
  cardHover: {
    transform: [{ translateY: -2 }],
  },
  hitArea: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  cover: {
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  coverBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
    borderWidth: 1,
  },
  coverInitial: {
    fontSize: 40,
    fontFamily: Fonts.serif,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  updated: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
