/**
 * A project card for the studio shelf.
 *
 * The cover leads, because a shelf is scanned by covers; under it the card says
 * only what you need to choose between projects — how much is written, whether
 * anything is broken, and how long ago you were here. Everything else about the
 * story lives one tap away on the project page.
 *
 * The wide `featured` variant is the same card, not a second component: it is
 * the project you were last editing, so it gets the room for «Continue».
 *
 * Uses useColors() — this is an author-facing screen and must follow the
 * editor's theme, unlike the always-dark showcase.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ShowcaseImage } from '@/components/showcase/ShowcaseImage';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { describeUpdatedAt, type StudioProject } from '@/lib/editor/story-library';
import { Fonts, withAlpha } from '@/lib/_core/theme';
import { posterFallbackForSeed } from '@/lib/showcase/story-showcase';
import { formatDate, SHORT_DATE } from '@/lib/format-date';
import { formatNumber } from '@/lib/format-number';

export interface EditorStoryCardProps {
  project: StudioProject;
  /** Carries «Continue» — the project the author was last editing. */
  featured?: boolean;
  /** Whether there is room to lay the featured card out in two columns. */
  wide?: boolean;
  now: number;
  onOpen: (storyId: string) => void;
  onContinue: (project: StudioProject) => void;
  onMenu: (project: StudioProject) => void;
}

export const EditorStoryCard = memo(function EditorStoryCard({
  project,
  featured = false,
  wide = false,
  now,
  onOpen,
  onContinue,
  onMenu,
}: EditorStoryCardProps) {
  const colors = useColors();
  const { t, pluralize, language } = useI18n();
  const [hovered, setHovered] = useState(false);

  const fallback = useMemo(() => posterFallbackForSeed(project.id), [project.id]);
  const initial = project.title.trim().charAt(0).toUpperCase() || '?';
  const tags = project.tags.slice(0, 3);

  const handleOpen = useCallback(() => onOpen(project.id), [onOpen, project.id]);
  const handleContinue = useCallback(() => onContinue(project), [onContinue, project]);
  const handleMenu = useCallback(() => onMenu(project), [onMenu, project]);

  const stats = useMemo(() => {
    const scenesLabel = pluralize(
      project.scenes,
      t('editor.sceneOne'),
      t('editor.sceneFew'),
      t('editor.sceneMany'),
    );
    if (project.words === null || project.choices === null) {
      return t('editor.cardStatsPending', { scenes: project.scenes, scenesLabel });
    }
    return t('editor.cardStats', {
      scenes: project.scenes,
      scenesLabel,
      words: formatNumber(project.words, language),
      wordsLabel: pluralize(project.words, t('editor.wordOne'), t('editor.wordFew'), t('editor.wordMany')),
      choices: project.choices,
      choicesLabel: pluralize(
        project.choices,
        t('editor.choiceOne'),
        t('editor.choiceFew'),
        t('editor.choiceMany'),
      ),
    });
  }, [language, pluralize, project.choices, project.scenes, project.words, t]);

  /**
   * Publication outranks the draft's own status in the headline: «published
   * v1.2» is what a reader experiences, and «ready» only ever meant «could
   * be». Issues still win over both — a broken graph is the thing the author
   * has to know first.
   */
  const status = useMemo(() => {
    if (project.status === 'pending') return null;
    if (project.status === 'issues') {
      return {
        color: colors.warning,
        label: t('editor.statusIssues', {
          count: project.issueCount,
          label: pluralize(
            project.issueCount,
            t('editor.issueOne'),
            t('editor.issueFew'),
            t('editor.issueMany'),
          ),
        }),
      };
    }
    if (project.publication) {
      return project.publication.hasUnreleasedChanges
        ? {
            color: colors.warning,
            label: t('editor.statusUnreleasedChanges', { version: project.publication.version }),
          }
        : {
            color: colors.success,
            label: t('editor.statusPublished', { version: project.publication.version }),
          };
    }
    if (project.status === 'ready') {
      return { color: colors.success, label: t('editor.statusReady') };
    }
    return { color: colors['foreground-tertiary'], label: t('editor.statusDraft') };
  }, [colors, pluralize, project.issueCount, project.publication, project.status, t]);

  const edited = useMemo(() => {
    const relative = describeUpdatedAt(project.updatedAt, now);
    switch (relative.unit) {
      case 'justNow':
        return t('editor.editedWhen', { when: t('editor.timeJustNow') });
      case 'minutes':
        return t('editor.editedWhen', { when: t('editor.timeMinutes', { count: relative.count }) });
      case 'hours':
        return t('editor.editedWhen', { when: t('editor.timeHours', { count: relative.count }) });
      case 'yesterday':
        return t('editor.editedWhen', { when: t('editor.timeYesterday') });
      case 'days':
        return t('editor.editedWhen', {
          when: t('editor.timeDays', {
            count: relative.count,
            label: pluralize(relative.count, t('editor.dayOne'), t('editor.dayFew'), t('editor.dayMany')),
          }),
        });
      default:
        return t('editor.editedWhen', {
          when: formatDate(project.updatedAt, language, SHORT_DATE),
        });
    }
  }, [language, now, pluralize, project.updatedAt, t]);

  const hoverProps =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {};

  // One narrow column has no room for two: the featured card keeps «Continue»
  // but stacks like every other card.
  const spread = featured && wide;

  const cover = (
    <View style={[styles.cover, spread && styles.coverFeatured, { backgroundColor: fallback.bg }]}>
      <Text style={[styles.coverInitial, { color: fallback.ink }]}>{initial}</Text>
      {project.coverUri ? (
        <ShowcaseImage assetRef={project.coverUri} style={styles.coverImage} resizeMode="cover" />
      ) : null}
      <View
        style={[styles.coverEdge, { borderColor: withAlpha(fallback.ink, 0.18) }]}
        pointerEvents="none"
      />
    </View>
  );

  const body = (
    <View style={[styles.body, spread && styles.bodyFeatured]}>
      <Text
        style={[styles.title, spread && styles.titleFeatured, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {project.title}
      </Text>
      <Text style={[styles.stats, { color: colors['foreground-secondary'] }]} numberOfLines={1}>
        {stats}
      </Text>
      <View style={styles.metaRow}>
        {status ? (
          <View style={styles.status}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        ) : null}
        <Text style={[styles.edited, { color: colors['foreground-tertiary'] }]} numberOfLines={1}>
          {edited}
        </Text>
      </View>
      {tags.length > 0 ? (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <View key={tag} style={[styles.tag, { borderColor: colors['border-subtle'] }]}>
              <Text style={[styles.tagText, { color: colors['foreground-tertiary'] }]} numberOfLines={1}>
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const actions = (
    <View style={[styles.featuredActions, spread && styles.featuredActionsSpread]}>
      <Pressable
        accessibilityRole="button"
        onPress={handleContinue}
        style={({ pressed }) => [
          styles.primaryAction,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.primaryActionText, { color: colors['foreground-on-primary'] }]}>
          {t('editor.continueEditing')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={handleOpen}
        style={({ pressed }) => [
          styles.ghostAction,
          { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.ghostActionText, { color: colors.foreground }]}>
          {t('editor.projectOverview')}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        spread && styles.cardFeatured,
        {
          backgroundColor: colors.surface,
          borderColor: hovered ? withAlpha(colors.primary, 0.55) : colors['border-subtle'],
        },
        hovered && Platform.OS === 'web' ? styles.cardHover : null,
      ]}
    >
      {/* The whole card opens the project page. The menu and the featured
          actions are siblings of this Pressable, never children: an interactive
          element inside another is invalid HTML on web. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={project.title}
        onPress={handleOpen}
        {...hoverProps}
        style={spread ? styles.hitAreaFeatured : styles.hitArea}
      >
        {cover}
        {spread ? null : body}
      </Pressable>

      {featured ? (
        spread ? (
          <View style={styles.featuredColumn}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={project.title}
              onPress={handleOpen}
              {...hoverProps}
            >
              {body}
            </Pressable>
            {actions}
          </View>
        ) : (
          actions
        )
      ) : null}

      {/* Anchored to the cover's box rather than the card's, so the button sits
          on the artwork in both the tall and the wide layout. */}
      <View
        style={[styles.menuAnchor, spread && styles.menuAnchorFeatured]}
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('editor.moreActions')} — ${project.title}`}
          onPress={handleMenu}
          hitSlop={6}
          style={({ pressed }) => [styles.menuButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <IconSymbol name="more" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({ transitionProperty: 'border-color, transform', transitionDuration: '160ms' } as object)
      : null),
  },
  cardFeatured: {
    flexDirection: 'row',
  },
  cardHover: {
    transform: [{ translateY: -2 }],
  },
  hitArea: {
    flex: 1,
  },
  hitAreaFeatured: {
    width: '44%',
  },
  featuredColumn: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing.lg,
  },
  cover: {
    aspectRatio: 3 / 2,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverFeatured: {
    aspectRatio: undefined,
    height: '100%',
    minHeight: 208,
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  coverEdge: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
  },
  coverInitial: {
    fontSize: 52,
    fontFamily: Fonts.serif,
    fontWeight: '700',
  },
  body: {
    padding: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.xs + 2,
  },
  bodyFeatured: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
  },
  titleFeatured: {
    fontSize: 25,
    lineHeight: 31,
  },
  stats: {
    ...typeScale.caption,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  statusText: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  edited: {
    ...typeScale.caption,
    flexShrink: 1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  tagText: {
    ...typeScale.micro,
  },
  featuredActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  featuredActionsSpread: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 0,
  },
  primaryAction: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
  primaryActionText: {
    ...typeScale.label,
    fontWeight: '800',
  },
  ghostAction: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  ghostActionText: {
    ...typeScale.label,
    fontWeight: '700',
  },
  menuAnchor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    padding: spacing.sm,
  },
  menuAnchorFeatured: {
    right: undefined,
    width: '44%',
  },
  menuButton: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // The cover behind it is a photo or a dark seeded plate in either theme, so
    // this scrim is deliberately not a theme token.
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
});
