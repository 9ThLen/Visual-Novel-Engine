import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { buildPreviewDebugModel } from '@/lib/editor/preview-debug';
import type { TimelineStep } from '@/lib/engine/types';
import type { SceneState } from '@/lib/engine/runtime-types';

export function PreviewInspector({
  sceneState,
  timeline,
  currentStepIndex,
  isTyping,
  isComplete,
}: {
  sceneState: SceneState;
  timeline: TimelineStep[];
  currentStepIndex: number;
  isTyping: boolean;
  isComplete: boolean;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);

  const model = useMemo(
    () => buildPreviewDebugModel(sceneState, timeline, currentStepIndex, Date.now(), isTyping, isComplete),
    [sceneState, timeline, currentStepIndex, isTyping, isComplete],
  );

  const surfaceContainer = withAlpha(colors['surface-container'] || colors.surface, 0.92);

  return (
    <View style={{ position: 'absolute', top: insets.top + spacing['2xl'], right: spacing.lg, zIndex: 40 }}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.full,
          backgroundColor: surfaceContainer,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'flex-end',
        }}
        accessibilityRole="button"
        accessibilityLabel={expanded ? t('editor.inspector.close') : t('editor.inspector.open')}
      >
        <IconSymbol name="list" size={18} color={colors.foreground} />
      </Pressable>

      {expanded ? (
        <View
          style={{
            marginTop: spacing.sm,
            width: 260,
            maxHeight: 420,
            backgroundColor: surfaceContainer,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
          }}
        >
          <Text style={{ ...typeScale.label, color: colors.foreground, marginBottom: spacing.sm }}>
            {t('editor.inspector.title')}
          </Text>
          <ScrollView style={{ maxHeight: 380 }}>
            <InspectorSection title={t('editor.inspector.position')} colors={colors}>
              <Text style={{ ...typeScale.caption, color: colors.foreground }}>
                {t('editor.inspector.step', { current: model.position.stepNumber, total: model.position.totalSteps })}
              </Text>
              {model.position.blockType ? (
                <Text style={{ ...typeScale.caption, color: colors.muted }}>
                  {t('editor.inspector.blockType', { type: model.position.blockType })}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                {model.position.isTyping ? <Badge label={t('editor.inspector.typing')} colors={colors} /> : null}
                {model.position.isComplete ? <Badge label={t('editor.inspector.complete')} colors={colors} /> : null}
              </View>
            </InspectorSection>

            <InspectorSection title={t('editor.inspector.variables')} colors={colors}>
              {model.variables.length === 0 ? (
                <Text style={{ ...typeScale.caption, color: colors.muted }}>{t('editor.inspector.noVariables')}</Text>
              ) : (
                model.variables.map((row) => (
                  <Text key={row.name} style={{ ...typeScale.caption, color: colors.foreground }}>
                    {row.name}: {row.display}
                  </Text>
                ))
              )}
            </InspectorSection>

            <InspectorSection title={t('editor.inspector.choices')} colors={colors}>
              {model.choices.length === 0 ? (
                <Text style={{ ...typeScale.caption, color: colors.muted }}>{t('editor.inspector.noChoices')}</Text>
              ) : (
                model.choices.map((row) => (
                  <View key={row.id} style={{ marginBottom: spacing.xs }}>
                    <Text style={{ ...typeScale.caption, color: colors.foreground }}>{row.text}</Text>
                    <Text style={{ ...typeScale.micro, color: colors.muted }}>
                      {t('editor.inspector.choiceTarget', {
                        target: row.targetLabel === 'next' ? t('editor.inspector.choiceNext') : row.targetLabel,
                      })}
                    </Text>
                    {row.conditionText ? (
                      <Text style={{ ...typeScale.micro, color: colors.muted }}>
                        {t('editor.inspector.choiceCondition', { condition: row.conditionText })}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </InspectorSection>

            <InspectorSection title={t('editor.inspector.effects')} colors={colors}>
              {model.effects.length === 0 ? (
                <Text style={{ ...typeScale.caption, color: colors.muted }}>{t('editor.inspector.noEffects')}</Text>
              ) : (
                model.effects.map((row, index) => (
                  <Text key={`${row.effectType}-${index}`} style={{ ...typeScale.caption, color: colors.foreground }}>
                    {row.remainingSeconds !== null
                      ? t('editor.inspector.effectSummary', {
                          type: row.effectType,
                          intensity: row.intensity,
                          seconds: row.remainingSeconds.toFixed(1),
                        })
                      : t('editor.inspector.effectSummaryNoTime', { type: row.effectType, intensity: row.intensity })}
                  </Text>
                ))
              )}
            </InspectorSection>

            <InspectorSection title={t('editor.inspector.music')} colors={colors}>
              <Text style={{ ...typeScale.caption, color: colors.foreground }}>
                {model.music.trackLabel === 'none' ? t('editor.inspector.musicNone') : model.music.trackLabel}
              </Text>
              <Text style={{ ...typeScale.micro, color: colors.muted }}>
                {model.music.playing ? t('editor.inspector.musicPlaying') : t('editor.inspector.musicStopped')}
                {' · '}
                {t('editor.inspector.musicVolume', { volume: model.music.volume })}
              </Text>
            </InspectorSection>

            {model.transition ? (
              <InspectorSection title={t('editor.inspector.transition')} colors={colors} last>
                <Text style={{ ...typeScale.caption, color: colors.foreground }}>
                  {t('editor.inspector.transitionSummary', {
                    mode: model.transition.mode ?? '—',
                    type: model.transition.type ?? '—',
                    target: model.transition.target ?? t('editor.inspector.choiceNext'),
                  })}
                </Text>
              </InspectorSection>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function InspectorSection({
  title,
  colors,
  last,
  children,
}: {
  title: string;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        marginBottom: spacing.sm,
        paddingBottom: last ? 0 : spacing.sm,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: withAlpha(colors.border, 0.5),
      }}
    >
      <Text style={{ ...typeScale.micro, color: colors.muted, marginBottom: spacing.xs, textTransform: 'uppercase' }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Badge({ label, colors }: { label: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.full,
        backgroundColor: withAlpha(colors.primary, 0.15),
      }}
    >
      <Text style={{ ...typeScale.micro, color: colors.primary }}>{label}</Text>
    </View>
  );
}
