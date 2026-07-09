import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha, type ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import type { SceneRecord } from '@/lib/engine/types';
import type { CoverageReport } from '@/lib/story-coverage';
import type { StoryDoctorFinding, StoryDoctorReport } from '@/lib/story-doctor';

interface StoryHealthCardProps {
  colors: ThemeColorPalette;
  report: StoryDoctorReport;
  coverageReport?: CoverageReport | null;
  scenes: SceneRecord[];
  onOpenScene: (sceneId: string) => void;
  onResetCoverage?: () => void;
  style?: StyleProp<ViewStyle>;
}

interface FindingGroup {
  sceneId: string | null;
  sceneName: string;
  findings: StoryDoctorFinding[];
}

function groupFindings(findings: StoryDoctorFinding[], scenes: SceneRecord[], generalLabel: string): FindingGroup[] {
  const sceneNames = new Map(scenes.map((scene) => [scene.id, scene.name || scene.id]));
  const groups = new Map<string, FindingGroup>();

  for (const finding of findings) {
    const key = finding.sceneId ?? '__general';
    const existing = groups.get(key);
    if (existing) {
      existing.findings.push(finding);
      continue;
    }
    groups.set(key, {
      sceneId: finding.sceneId ?? null,
      sceneName: finding.sceneId ? sceneNames.get(finding.sceneId) ?? finding.sceneId : generalLabel,
      findings: [finding],
    });
  }

  return Array.from(groups.values());
}

export function StoryHealthCard({
  colors,
  report,
  coverageReport,
  scenes,
  onOpenScene,
  onResetCoverage,
  style,
}: StoryHealthCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [coverageExpanded, setCoverageExpanded] = useState(false);
  const hasFindings = report.findings.length > 0;
  const hasCoverageMisses = Boolean(
    coverageReport
    && (coverageReport.unvisitedScenes.length > 0 || coverageReport.neverTakenChoices.length > 0),
  );
  const statusColor = report.summary.errors > 0
    ? colors.danger
    : report.summary.warnings > 0
      ? colors.warning
      : colors.success;
  const groups = useMemo(
    () => groupFindings(report.findings, scenes, t('storyDoctor.general')),
    [report.findings, scenes, t],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors['surface-1'], borderColor: colors.border }, style]}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={t('storyDoctor.title')}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.75 : 1 }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(statusColor, 0.12) }]}>
          <IconSymbol name={hasFindings ? 'question' : 'checkmark'} size={18} color={statusColor} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('storyDoctor.title')}</Text>
          <Text style={[styles.status, { color: colors.muted }]} numberOfLines={1}>
            {hasFindings
              ? t('storyDoctor.issueCount', {
                  errors: report.summary.errors,
                  warnings: report.summary.warnings,
                })
              : t('storyDoctor.clean')}
          </Text>
        </View>
        <IconSymbol name={expanded ? 'chevron.up' : 'chevron.down'} size={18} color={colors.muted} />
      </Pressable>

      {expanded && hasFindings ? (
        <View style={styles.body}>
          {groups.map((group) => (
            <View key={group.sceneId ?? 'general'} style={styles.group}>
              <Text style={[styles.groupTitle, { color: colors.foreground }]} numberOfLines={1}>
                {group.sceneName}
              </Text>
              {group.findings.map((finding, index) => {
                const color = finding.severity === 'error' ? colors.danger : colors.warning;
                const content = (
                  <View style={styles.issueRow}>
                    <View style={[styles.issueIcon, { backgroundColor: withAlpha(color, 0.13) }]}>
                      <IconSymbol name={finding.severity === 'error' ? 'xmark' : 'question'} size={13} color={color} />
                    </View>
                    <Text style={[styles.issueText, { color: colors['foreground-secondary'] }]}>
                      {t(finding.messageKey, finding.messageParams)}
                    </Text>
                  </View>
                );

                if (!finding.sceneId) {
                  return <View key={`${finding.code}-${index}`}>{content}</View>;
                }

                return (
                  <Pressable
                    key={`${finding.code}-${finding.sceneId}-${finding.stepId ?? index}`}
                    onPress={() => onOpenScene(finding.sceneId as string)}
                    accessibilityRole="button"
                    accessibilityLabel={t('storyDoctor.openSceneIssue', { scene: group.sceneName })}
                    style={({ pressed }) => [pressed && styles.issuePressed]}
                  >
                    {content}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      {coverageReport ? (
        <View style={[styles.coverageSection, { borderTopColor: colors.border }]}>
          <View style={styles.coverageHeader}>
            <View style={[styles.iconWrap, { backgroundColor: withAlpha(colors.primary, 0.1) }]}>
              <IconSymbol name={hasCoverageMisses ? 'timeline' : 'checkmark'} size={18} color={hasCoverageMisses ? colors.primary : colors.success} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.foreground }]}>{t('storyCoverage.title')}</Text>
              <Text style={[styles.status, { color: colors.muted }]} numberOfLines={1}>
                {t('storyCoverage.summary', {
                  visited: coverageReport.visitedReachableScenes,
                  total: coverageReport.totalReachableScenes,
                  choices: coverageReport.neverTakenChoices.length,
                })}
              </Text>
            </View>
            {onResetCoverage ? (
              <Pressable
                onPress={onResetCoverage}
                accessibilityRole="button"
                accessibilityLabel={t('storyCoverage.reset')}
                style={({ pressed }) => [styles.resetButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="xmark" size={13} color={colors.muted} />
                <Text style={[styles.resetText, { color: colors.muted }]}>{t('storyCoverage.reset')}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.coverageTrack, { backgroundColor: withAlpha(colors.foreground, 0.08) }]}>
            <View
              style={[
                styles.coverageFill,
                {
                  backgroundColor: hasCoverageMisses ? colors.primary : colors.success,
                  width: `${coverageReport.totalCoveragePercent}%`,
                },
              ]}
            />
          </View>

          <Pressable
            onPress={() => setCoverageExpanded((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={t('storyCoverage.toggleDetails')}
            accessibilityState={{ expanded: coverageExpanded }}
            style={({ pressed }) => [styles.coverageToggle, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={[styles.coverageToggleText, { color: colors['foreground-secondary'] }]}>
              {t('storyCoverage.unvisitedScenes', { count: coverageReport.unvisitedScenes.length })}
            </Text>
            <Text style={[styles.coverageToggleText, { color: colors['foreground-secondary'] }]}>
              {t('storyCoverage.untakenChoices', { count: coverageReport.neverTakenChoices.length })}
            </Text>
            <IconSymbol name={coverageExpanded ? 'chevron.up' : 'chevron.down'} size={16} color={colors.muted} />
          </Pressable>

          {coverageExpanded ? (
            <View style={styles.body}>
              {coverageReport.unvisitedScenes.length > 0 ? (
                <View style={styles.group}>
                  <Text style={[styles.groupTitle, { color: colors.foreground }]}>{t('storyCoverage.unvisitedScenesTitle')}</Text>
                  {coverageReport.unvisitedScenes.map((item) => (
                    <Pressable
                      key={item.sceneId}
                      onPress={() => onOpenScene(item.sceneId)}
                      accessibilityRole="button"
                      accessibilityLabel={t('storyCoverage.openScene', { scene: item.sceneName })}
                      style={({ pressed }) => [styles.coverageItem, pressed && styles.issuePressed]}
                    >
                      <Text style={[styles.issueText, { color: colors['foreground-secondary'] }]} numberOfLines={1}>
                        {item.sceneName}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {coverageReport.neverTakenChoices.length > 0 ? (
                <View style={styles.group}>
                  <Text style={[styles.groupTitle, { color: colors.foreground }]}>{t('storyCoverage.untakenChoicesTitle')}</Text>
                  {coverageReport.neverTakenChoices.map((item) => (
                    <Pressable
                      key={`${item.sceneId}-${item.stepId}-${item.optionId}`}
                      onPress={() => onOpenScene(item.sceneId)}
                      accessibilityRole="button"
                      accessibilityLabel={t('storyCoverage.openChoice', { scene: item.sceneName, choice: item.optionText })}
                      style={({ pressed }) => [styles.coverageItem, pressed && styles.issuePressed]}
                    >
                      <Text style={[styles.issueText, { color: colors['foreground-secondary'] }]} numberOfLines={2}>
                        {t('storyCoverage.choiceItem', { scene: item.sceneName, choice: item.optionText })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {!hasCoverageMisses ? (
                <Text style={[styles.issueText, { color: colors['foreground-secondary'] }]}>
                  {t('storyCoverage.complete')}
                </Text>
              ) : null}
            </View>
          ) : null}
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
  coverageSection: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  coverageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  coverageTrack: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  coverageFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  coverageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  coverageToggleText: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  coverageItem: {
    paddingVertical: 4,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  resetText: {
    ...typeScale.caption,
    fontWeight: '700',
  },
});
