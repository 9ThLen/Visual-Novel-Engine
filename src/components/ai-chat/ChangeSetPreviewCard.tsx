import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ColorScheme } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { AiChangeSetDescription } from '@/lib/ai/change-set';
import type { ScenePatchDescription } from '@/lib/ai/scene-patch';
import { diffStepFields, stringifyValue, summarizeStep } from './patch-change-summary';

const ACCENT_ADDED = '#22c55e';
const ACCENT_REMOVED = '#ef4444';
const ACCENT_CHANGED = '#eab308';

interface ChangeSetPreviewCardProps {
  description: AiChangeSetDescription;
  explanation: string;
  colorScheme?: ColorScheme;
  applying?: boolean;
  applied?: boolean;
  canRollback?: boolean;
  onApply: () => void;
  onReject: () => void;
  onRollback?: () => void;
}

export function ChangeSetPreviewCard({
  description,
  explanation,
  colorScheme,
  applying,
  applied,
  canRollback,
  onApply,
  onReject,
  onRollback,
}: ChangeSetPreviewCardProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(() => new Set());
  const createdCount = description.scenes.filter(scene => scene.kind === 'created').length;
  const modifiedCount = description.scenes.length - createdCount;

  const toggleScene = (sceneRef: string) => {
    setCollapsedScenes(current => {
      const next = new Set(current);
      if (next.has(sceneRef)) next.delete(sceneRef);
      else next.add(sceneRef);
      return next;
    });
  };

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, padding: 12, gap: 10 }}>
      <View>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '800' }}>
          {t('aiChat.changeSet.title', undefined, 'Story changes')}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{explanation}</Text>
      </View>

      {description.scenes.map((scene) => {
        const collapsed = collapsedScenes.has(scene.sceneRef);
        const label = scene.kind === 'created' ? scene.name : scene.sceneRef;
        return (
          <View key={`${scene.kind}-${scene.sceneRef}`} style={{ borderLeftWidth: 3, borderLeftColor: scene.kind === 'created' ? ACCENT_ADDED : colors.primary, paddingLeft: 8, gap: 5 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: !collapsed }} onPress={() => toggleScene(scene.sceneRef)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {scene.kind === 'created' ? (
                  <Text style={{ color: ACCENT_ADDED, fontSize: 10, fontWeight: '900' }}>NEW</Text>
                ) : null}
                <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '800', flex: 1 }}>{label}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{collapsed ? '+' : '−'}</Text>
              </View>
            </Pressable>
            {!collapsed && scene.kind === 'created' ? (
              <View style={{ gap: 3 }}>
                <Text style={rowStyle(colors)}>{t('aiChat.changeSet.steps', { count: scene.stepCount }, `${scene.stepCount} steps`)}</Text>
                {scene.teaser ? <Text style={rowStyle(colors)}>{scene.teaser}</Text> : null}
              </View>
            ) : null}
            {!collapsed && scene.kind === 'modified' ? <ModifiedRows changes={scene.changes} colors={colors} /> : null}
          </View>
        );
      })}

      {description.connections.length > 0 ? (
        <Section title={t('aiChat.changeSet.links', { count: description.connections.length }, `Links (${description.connections.length})`)} accent={colors.primary} colors={colors}>
          {description.connections.map((connection, index) => (
            <Text key={`${connection.sceneRef}-${connection.outputPort}-${index}`} style={rowStyle(colors)}>
              {connection.sceneRef} → {connection.targetRef ?? '—'}{connection.label ? ` via choice '${connection.label}'` : ` (${connection.outputPort})`}
            </Text>
          ))}
        </Section>
      ) : null}

      {description.characters.length > 0 ? (
        <Section title={t('aiChat.changeSet.characters', { count: description.characters.length }, `Characters (${description.characters.length})`)} accent={colors.primary} colors={colors}>
          {description.characters.map((character, index) => (
            <Text key={`${character.kind}-${character.ref}-${index}`} style={rowStyle(colors)}>
              {character.kind === 'created' ? 'NEW' : 'UPDATED'}: {character.name ?? character.ref}
            </Text>
          ))}
        </Section>
      ) : null}

      {description.warnings.length > 0 ? (
        <Section title={t('aiChat.changeSet.warnings', undefined, 'Warnings')} accent={ACCENT_CHANGED} colors={colors}>
          {description.warnings.map((warning, index) => <Text key={`warning-${index}`} style={{ color: ACCENT_CHANGED, fontSize: 11 }}>{warning}</Text>)}
        </Section>
      ) : null}

      <Text style={{ color: colors.muted, fontSize: 11 }}>
        {t('aiChat.changeSet.summary', { created: createdCount, modified: modifiedCount, links: description.connections.length }, `${createdCount} scenes created, ${modifiedCount} modified, ${description.connections.length} links`)}
      </Text>

      {applied ? (
        canRollback && onRollback ? <ActionButton label={t('aiChat.rollback', undefined, 'Rollback')} onPress={onRollback} colors={colors} disabled={applying} primary /> : null
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ActionButton label={t('aiChat.patch.reject')} onPress={onReject} colors={colors} disabled={applying} />
          <ActionButton label={t('aiChat.patch.apply')} onPress={onApply} colors={colors} disabled={applying} primary />
        </View>
      )}
    </View>
  );
}

function ModifiedRows({ changes, colors }: { changes: ScenePatchDescription['changes']; colors: ReturnType<typeof useColors> }) {
  return <View style={{ gap: 3 }}>{changes.flatMap((change, index) => {
    if (change.kind === 'step_added') return [<Text key={`added-${index}`} style={{ ...rowStyle(colors), color: ACCENT_ADDED }}>+ {summarizeStep(change.step)}</Text>];
    if (change.kind === 'step_removed') return [<Text key={`removed-${index}`} style={{ ...rowStyle(colors), color: ACCENT_REMOVED }}>− {summarizeStep(change.step)}</Text>];
    if (change.kind === 'step_changed') return diffStepFields(change.before, change.after).map(field => <Text key={`changed-${index}-${field.field}`} style={rowStyle(colors)}>{field.field}: {field.before} → {field.after}</Text>);
    if (change.kind === 'metadata_changed') return [<Text key={`meta-${index}`} style={rowStyle(colors)}>{change.field}: {stringifyValue(change.before)} → {stringifyValue(change.after)}</Text>];
    return [<Text key={`connection-${index}`} style={rowStyle(colors)}>{change.outputPort}: {stringifyValue(change.before)} → {stringifyValue(change.after)}</Text>];
  })}</View>;
}

function Section({ title, accent, colors, children }: { title: string; accent: string; colors: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return <View style={{ borderLeftWidth: 3, borderLeftColor: accent, paddingLeft: 8, gap: 3 }}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{title}</Text>{children}</View>;
}

function ActionButton({ label, onPress, colors, disabled, primary }: { label: string; onPress: () => void; colors: ReturnType<typeof useColors>; disabled?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: primary ? 0 : 1, borderColor: colors.border, backgroundColor: primary ? colors.primary : undefined, opacity: disabled ? 0.6 : 1 }}><Text style={{ color: primary ? '#ffffff' : colors.foreground, fontSize: 13, fontWeight: '700' }}>{label}</Text></Pressable>;
}

function rowStyle(colors: ReturnType<typeof useColors>) {
  return { color: colors.foreground, fontSize: 12, lineHeight: 17 } as const;
}
