import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha, type ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import type { ChoiceStatsReport } from '@/lib/story-coverage';

interface ChoiceStatisticsCardProps {
  colors: ThemeColorPalette;
  report: ChoiceStatsReport;
  onReset: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ChoiceStatisticsCard({ colors, report, onReset, style }: ChoiceStatisticsCardProps) {
  const { t } = useI18n();
  const sceneGroups = useMemo(
    () => report.scenes
      .map((scene) => ({
        ...scene,
        steps: scene.steps.filter((step) => step.totalPicks > 0),
      }))
      .filter((scene) => scene.steps.length > 0),
    [report.scenes],
  );

  if (report.totalPicks <= 0 || sceneGroups.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors['surface-1'], borderColor: colors.border }, style]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(colors.primary, 0.1) }]}>
          <IconSymbol name="list" size={18} color={colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('choiceStats.title')}</Text>
          <Text style={[styles.status, { color: colors.muted }]} numberOfLines={1}>
            {t('choiceStats.summary', { count: report.totalPicks })}
          </Text>
        </View>
        <Pressable
          onPress={onReset}
          accessibilityRole="button"
          accessibilityLabel={t('choiceStats.reset')}
          style={({ pressed }) => [styles.resetButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <IconSymbol name="xmark" size={13} color={colors.muted} />
          <Text style={[styles.resetText, { color: colors.muted }]}>{t('choiceStats.reset')}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {sceneGroups.map((scene) => (
          <View key={scene.sceneId} style={styles.sceneGroup}>
            <Text style={[styles.sceneTitle, { color: colors.foreground }]} numberOfLines={1}>
              {scene.sceneName}
            </Text>
            {scene.steps.map((step) => (
              <View key={step.stepId} style={styles.choiceGroup}>
                <Text style={[styles.stepTitle, { color: colors.muted }]} numberOfLines={1}>
                  {t('choiceStats.choiceStep', { stepId: step.stepId })}
                </Text>
                {step.options.map((option) => (
                  <View key={option.optionId} style={styles.optionRow}>
                    <View style={styles.optionHeader}>
                      <Text style={[styles.optionText, { color: colors['foreground-secondary'] }]} numberOfLines={2}>
                        {option.optionText}
                      </Text>
                      <Text style={[styles.optionCount, { color: colors.foreground }]}>
                        {t('choiceStats.optionStats', {
                          count: option.count,
                          percentage: option.percentage,
                        })}
                      </Text>
                    </View>
                    <View style={[styles.track, { backgroundColor: withAlpha(colors.foreground, 0.08) }]}>
                      <View
                        style={[
                          styles.fill,
                          {
                            backgroundColor: option.count > 0 ? colors.primary : withAlpha(colors.foreground, 0.2),
                            width: `${option.percentage}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: 320,
    minWidth: 260,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
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
  body: {
    gap: spacing.md,
  },
  sceneGroup: {
    gap: spacing.sm,
  },
  sceneTitle: {
    ...typeScale.caption,
    fontWeight: '800',
  },
  choiceGroup: {
    gap: spacing.sm,
  },
  stepTitle: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  optionRow: {
    gap: 5,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  optionText: {
    flex: 1,
    ...typeScale.caption,
    lineHeight: 18,
  },
  optionCount: {
    ...typeScale.caption,
    fontWeight: '800',
  },
  track: {
    height: 7,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
});
