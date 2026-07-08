import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha, type ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import type { SceneRecord } from '@/lib/engine/types';
import type { StoryDoctorFinding, StoryDoctorReport } from '@/lib/story-doctor';

interface StoryHealthCardProps {
  colors: ThemeColorPalette;
  report: StoryDoctorReport;
  scenes: SceneRecord[];
  onOpenScene: (sceneId: string) => void;
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

export function StoryHealthCard({ colors, report, scenes, onOpenScene, style }: StoryHealthCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hasFindings = report.findings.length > 0;
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
});
