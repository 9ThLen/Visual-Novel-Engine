import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ColorScheme } from '@/constants/theme';
import type { ScenePatchDescription } from '@/lib/ai/scene-patch';
import { diffStepFields, stringifyValue, summarizeStep } from './patch-change-summary';

const ACCENT_ADDED = '#22c55e';
const ACCENT_REMOVED = '#ef4444';
const ACCENT_CHANGED = '#eab308';
const ACCENT_WARNING = '#eab308';

interface PatchPreviewCardProps {
  description: ScenePatchDescription;
  explanation: string;
  colorScheme?: ColorScheme;
  applying?: boolean;
  onApply: () => void;
  onReject: () => void;
}

export function PatchPreviewCard({
  description,
  explanation,
  colorScheme,
  applying,
  onApply,
  onReject,
}: PatchPreviewCardProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();

  const added = description.changes.filter((change) => change.kind === 'step_added');
  const removed = description.changes.filter((change) => change.kind === 'step_removed');
  const changed = description.changes.filter((change) => change.kind === 'step_changed');
  const metaAndConnections = description.changes.filter(
    (change) => change.kind === 'metadata_changed' || change.kind === 'connection_changed',
  );

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        backgroundColor: colors.surface,
        padding: 12,
        gap: 10,
      }}
    >
      <View>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '800' }}>{description.sceneName}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{explanation}</Text>
      </View>

      {added.length > 0 ? (
        <ChangeGroup accent={ACCENT_ADDED} title={t('aiChat.patch.added', { count: added.length })} colors={colors}>
          {added.map((change, index) => (
            <Text key={`added-${index}`} style={rowTextStyle(colors)}>
              {change.kind === 'step_added' ? summarizeStep(change.step) : null}
            </Text>
          ))}
        </ChangeGroup>
      ) : null}

      {removed.length > 0 ? (
        <ChangeGroup accent={ACCENT_REMOVED} title={t('aiChat.patch.removed', { count: removed.length })} colors={colors}>
          {removed.map((change, index) => (
            <Text key={`removed-${index}`} style={rowTextStyle(colors)}>
              {change.kind === 'step_removed' ? summarizeStep(change.step) : null}
            </Text>
          ))}
        </ChangeGroup>
      ) : null}

      {changed.length > 0 ? (
        <ChangeGroup accent={ACCENT_CHANGED} title={t('aiChat.patch.changed', { count: changed.length })} colors={colors}>
          {changed.map((change, index) =>
            change.kind === 'step_changed'
              ? diffStepFields(change.before, change.after).map((field) => (
                  <Text key={`changed-${index}-${field.field}`} style={rowTextStyle(colors)}>
                    {field.field}: {field.before} → {field.after}
                  </Text>
                ))
              : null,
          )}
        </ChangeGroup>
      ) : null}

      {metaAndConnections.length > 0 ? (
        <ChangeGroup accent={colors.primary} title={t('aiChat.patch.metadata')} colors={colors}>
          {metaAndConnections.map((change, index) =>
            change.kind === 'metadata_changed' ? (
              <Text key={`meta-${index}`} style={rowTextStyle(colors)}>
                {change.field}: {stringifyValue(change.before)} → {stringifyValue(change.after)}
              </Text>
            ) : change.kind === 'connection_changed' ? (
              <Text key={`conn-${index}`} style={rowTextStyle(colors)}>
                {change.outputPort}: {stringifyValue(change.before)} → {stringifyValue(change.after)}
              </Text>
            ) : null,
          )}
        </ChangeGroup>
      ) : null}

      {description.warnings.length > 0 ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: ACCENT_WARNING, paddingLeft: 8, gap: 3 }}>
          {description.warnings.map((warning, index) => (
            <Text key={`warning-${index}`} style={{ color: ACCENT_WARNING, fontSize: 11 }}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
        <Pressable
          accessibilityRole="button"
          disabled={applying}
          onPress={onReject}
          style={{
            flex: 1,
            minHeight: 36,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: applying ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>{t('aiChat.patch.reject')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={applying}
          onPress={onApply}
          style={{
            flex: 1,
            minHeight: 36,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            backgroundColor: colors.primary,
            opacity: applying ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>{t('aiChat.patch.apply')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function rowTextStyle(colors: ReturnType<typeof useColors>) {
  return { color: colors.foreground, fontSize: 12, lineHeight: 17 } as const;
}

function ChangeGroup({
  accent,
  title,
  colors,
  children,
}: {
  accent: string;
  title: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: accent, paddingLeft: 8, gap: 3 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{title}</Text>
      {children}
    </View>
  );
}
