/**
 * components/story-home/PlaytestCoverageCard.tsx — what a playthrough has and
 * has not reached.
 *
 * Lifted out of `StoryHealthCard`, where it used to ride along as a second
 * section: on the project page coverage now has its own tile, and a report that
 * answers to two tiles is the thing this redesign exists to remove.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha, type ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import type { CoverageReport } from '@/lib/story-coverage';

interface PlaytestCoverageCardProps {
  colors: ThemeColorPalette;
  report: CoverageReport;
  onOpenScene: (sceneId: string) => void;
  onReset?: () => void;
  /** Rendered inside a band that already draws the surface and the frame. */
  embedded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PlaytestCoverageCard({
  colors,
  report,
  onOpenScene,
  onReset,
  embedded = false,
  style,
}: PlaytestCoverageCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hasMisses = useMemo(
    () => report.unvisitedScenes.length > 0 || report.neverTakenChoices.length > 0,
    [report.neverTakenChoices.length, report.unvisitedScenes.length],
  );

  return (
    <View
      style={[
        styles.card,
        embedded
          ? styles.embedded
          : { backgroundColor: colors['surface-1'], borderColor: colors.border },
        style,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(colors.primary, 0.1) }]}>
          <IconSymbol
            name={hasMisses ? 'timeline' : 'checkmark'}
            size={18}
            color={hasMisses ? colors.primary : colors.success}
          />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('storyCoverage.title')}</Text>
          <Text style={[styles.status, { color: colors.muted }]} numberOfLines={1}>
            {t('storyCoverage.summary', {
              visited: report.visitedReachableScenes,
              total: report.totalReachableScenes,
              choices: report.neverTakenChoices.length,
            })}
          </Text>
        </View>
        {onReset ? (
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel={t('storyCoverage.reset')}
            style={({ pressed }) => [styles.resetButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <IconSymbol name="xmark" size={13} color={colors.muted} />
            <Text style={[styles.resetText, { color: colors.muted }]}>{t('storyCoverage.reset')}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.track, { backgroundColor: withAlpha(colors.foreground, 0.08) }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: hasMisses ? colors.primary : colors.success,
              width: `${report.totalCoveragePercent}%`,
            },
          ]}
        />
      </View>

      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={t('storyCoverage.toggleDetails')}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.75 : 1 }]}
      >
        <Text style={[styles.toggleText, { color: colors['foreground-secondary'] }]}>
          {t('storyCoverage.unvisitedScenes', { count: report.unvisitedScenes.length })}
        </Text>
        <Text style={[styles.toggleText, { color: colors['foreground-secondary'] }]}>
          {t('storyCoverage.untakenChoices', { count: report.neverTakenChoices.length })}
        </Text>
        <IconSymbol name={expanded ? 'chevron.up' : 'chevron.down'} size={16} color={colors.muted} />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {report.unvisitedScenes.length > 0 ? (
            <View style={styles.group}>
              <Text style={[styles.groupTitle, { color: colors.foreground }]}>
                {t('storyCoverage.unvisitedScenesTitle')}
              </Text>
              {report.unvisitedScenes.map((item) => (
                <Pressable
                  key={item.sceneId}
                  onPress={() => onOpenScene(item.sceneId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('storyCoverage.openScene', { scene: item.sceneName })}
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                >
                  <Text style={[styles.itemText, { color: colors['foreground-secondary'] }]} numberOfLines={1}>
                    {item.sceneName}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {report.neverTakenChoices.length > 0 ? (
            <View style={styles.group}>
              <Text style={[styles.groupTitle, { color: colors.foreground }]}>
                {t('storyCoverage.untakenChoicesTitle')}
              </Text>
              {report.neverTakenChoices.map((item) => (
                <Pressable
                  key={`${item.sceneId}-${item.stepId}-${item.optionId}`}
                  onPress={() => onOpenScene(item.sceneId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('storyCoverage.openChoice', { scene: item.sceneName, choice: item.optionText })}
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                >
                  <Text style={[styles.itemText, { color: colors['foreground-secondary'] }]} numberOfLines={2}>
                    {t('storyCoverage.choiceItem', { scene: item.sceneName, choice: item.optionText })}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {!hasMisses ? (
            <Text style={[styles.itemText, { color: colors['foreground-secondary'] }]}>
              {t('storyCoverage.complete')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  embedded: {
    flexGrow: 0,
    flexBasis: 'auto',
    minWidth: 0,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    backgroundColor: 'transparent',
  },
  card: {
    flexGrow: 1,
    flexBasis: 260,
    minWidth: 230,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typeScale.label,
    fontFamily: Fonts.serif,
    fontWeight: '700',
  },
  status: {
    ...typeScale.caption,
    fontWeight: '500',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  resetText: {
    ...typeScale.micro,
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleText: {
    ...typeScale.caption,
    fontWeight: '500',
  },
  body: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  item: {
    paddingVertical: 3,
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemText: {
    ...typeScale.caption,
    fontWeight: '500',
  },
});
