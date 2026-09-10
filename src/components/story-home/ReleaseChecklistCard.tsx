import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha, type ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import type { ReleaseFinding, ReleasePreflightReport } from '@/lib/release/preflight';

interface ReleaseChecklistCardProps {
  colors: ThemeColorPalette;
  report: ReleasePreflightReport;
  onOpenScene: (sceneId: string) => void;
  /** Rendered inside a band that already draws the surface and the frame. */
  embedded?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface FindingListProps {
  colors: ThemeColorPalette;
  title: string;
  findings: ReleaseFinding[];
  tone: string;
  icon: 'xmark' | 'question';
  onOpenScene: (sceneId: string) => void;
}

function FindingList({ colors, title, findings, tone, icon, onOpenScene }: FindingListProps) {
  const { t } = useI18n();
  if (findings.length === 0) return null;

  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: colors.foreground }]}>{title}</Text>
      {findings.map((finding, index) => {
        const row = (
          <View style={styles.issueRow}>
            <View style={[styles.issueIcon, { backgroundColor: withAlpha(tone, 0.13) }]}>
              <IconSymbol name={icon} size={13} color={tone} />
            </View>
            <Text style={[styles.issueText, { color: colors['foreground-secondary'] }]}>
              {t(finding.messageKey, finding.messageParams)}
            </Text>
          </View>
        );

        // Only findings that point at a scene are openable; the rest are about
        // the story as a whole and have nowhere to navigate to.
        if (!finding.sceneId) {
          return <View key={`${finding.code}-${index}`}>{row}</View>;
        }
        return (
          <Pressable
            key={`${finding.code}-${finding.sceneId}-${finding.stepId ?? index}`}
            onPress={() => onOpenScene(finding.sceneId as string)}
            accessibilityRole="button"
            accessibilityLabel={t('releasePreflight.openIssue')}
            style={({ pressed }) => [pressed && styles.issuePressed]}
          >
            {row}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The release gate, as the author sees it: can this story be published, and if
 * not, what stands in the way.
 *
 * Deliberately a sibling of `StoryHealthCard` rather than a section inside it.
 * The doctor answers "is this story well-formed"; this answers "is it ready to
 * hand to a stranger", and the two are asked at different moments — one while
 * writing, one when finishing.
 */
export function ReleaseChecklistCard({
  colors,
  report,
  onOpenScene,
  embedded = false,
  style,
}: ReleaseChecklistCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const blocked = report.blockers.length > 0;
  const hasFindings = blocked || report.warnings.length > 0;
  const statusColor = blocked
    ? colors.danger
    : report.warnings.length > 0
      ? colors.warning
      : colors.success;

  const status = blocked
    ? t('releasePreflight.blocked', { count: report.blockers.length })
    : report.warnings.length > 0
      ? t('releasePreflight.warningsOnly', { count: report.warnings.length })
      : t('releasePreflight.ready');

  // Inside the state band the tile above already carries the summary, so the
  // card is only its findings: no surface, no header, nothing to expand.
  if (embedded) {
    return (
      <View style={[styles.body, style]}>
        <FindingList
          colors={colors}
          title={t('releasePreflight.blockersTitle')}
          findings={report.blockers}
          tone={colors.danger}
          icon="xmark"
          onOpenScene={onOpenScene}
        />
        <FindingList
          colors={colors}
          title={t('releasePreflight.warningsTitle')}
          findings={report.warnings}
          tone={colors.warning}
          icon="question"
          onOpenScene={onOpenScene}
        />
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors['surface-1'], borderColor: colors.border }, style]}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={t('releasePreflight.title')}
        accessibilityState={{ expanded }}
        disabled={!hasFindings}
        style={({ pressed }) => [styles.header, { opacity: pressed && hasFindings ? 0.75 : 1 }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(statusColor, 0.12) }]}>
          <IconSymbol name={blocked ? 'xmark' : 'checkmark'} size={18} color={statusColor} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t('releasePreflight.title')}
          </Text>
          <Text style={[styles.status, { color: colors.muted }]} numberOfLines={2}>
            {status}
          </Text>
        </View>
        {hasFindings ? (
          <IconSymbol name={expanded ? 'chevron.up' : 'chevron.down'} size={18} color={colors.muted} />
        ) : null}
      </Pressable>

      <Text style={[styles.stats, { color: colors.muted }]} numberOfLines={2}>
        {t('releasePreflight.stats', {
          scenes: report.stats.scenes,
          words: report.stats.words,
          readMinutes: report.stats.readMinutes,
          endings: report.stats.endings,
        })}
      </Text>

      {expanded && hasFindings ? (
        <View style={styles.body}>
          <FindingList
            colors={colors}
            title={t('releasePreflight.blockersTitle')}
            findings={report.blockers}
            tone={colors.danger}
            icon="xmark"
            onOpenScene={onOpenScene}
          />
          <FindingList
            colors={colors}
            title={t('releasePreflight.warningsTitle')}
            findings={report.warnings}
            tone={colors.warning}
            icon="question"
            onOpenScene={onOpenScene}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 210,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
    ...typeScale.body,
    fontFamily: Fonts.sans,
    fontWeight: '800',
  },
  status: {
    ...typeScale.caption,
  },
  stats: {
    ...typeScale.caption,
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
    fontWeight: '800',
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  issuePressed: {
    opacity: 0.72,
  },
  issueIcon: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  issueText: {
    flex: 1,
    ...typeScale.caption,
    lineHeight: 18,
  },
});
