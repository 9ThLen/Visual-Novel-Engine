import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppModal } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha, type ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { formatDate, SHORT_DATE } from '@/lib/format-date';
import {
  currentPublishedRelease,
  highestReleaseVersion,
  type ReleaseMeta,
} from '@/lib/release/release-storage';
import type { ReleasePreflightReport } from '@/lib/release/preflight';
import type { PlayerBundleProgress } from '@/lib/release/shell-build';
import type { BuildJobSummary } from '@/lib/release/build-job';
import type { BuildTarget } from '@/lib/release/build-request';
import type { BuildHelperSettings } from '@/lib/release/build-session';
import { RELEASE_TARGETS, releaseChannelForTargets, type ReleaseTarget, type ReleaseChannel } from '@/lib/release/types';
import { isNewerReleaseVersion, nextReleaseVersion } from '@/lib/release/version';
import type { StoryMetadata } from '@/lib/story-domain';

export interface PublishRequest {
  version: string;
  channel: ReleaseChannel;
  targets: ReleaseTarget[];
  notes?: string;
}

interface ReleaseCardProps {
  colors: ThemeColorPalette;
  story: StoryMetadata;
  releases: ReleaseMeta[];
  preflight: ReleasePreflightReport | null;
  /**
   * Where the author means to publish. The gate is answered for this, not for
   * the strictest channel: a bundle handed to a friend should not be blocked by
   * what a storefront listing would need.
   */
  targets: ReleaseTarget[];
  onTargetsChange: (targets: ReleaseTarget[]) => void;
  busy?: boolean;
  onPublish: (request: PublishRequest) => void;
  onSetPublished: (releaseId: string, published: boolean) => void;
  /**
   * Turn a stored release into a folder the author can hand to a stranger.
   * Absent when the running build cannot do it at all — on native there is no
   * player shell to build from.
   */
  onExportBundle?: (releaseId: string) => void;
  /** Non-null while an export is running; drives the label. */
  exportProgress?: PlayerBundleProgress | null;
  /** Already localized by the caller: the reasons are not all from one place. */
  exportMessage?: { tone: 'error' | 'done'; text: string } | null;
  buildSettings?: BuildHelperSettings;
  onBuildSettingsChange?: (settings: BuildHelperSettings) => void;
  buildSummary?: BuildJobSummary | null;
  buildPreparing?: boolean;
  buildError?: string | null;
  onBuildAndroid?: (releaseId: string, target: BuildTarget) => void;
  onCancelBuild?: (requestId: string) => void;
  onRetryBuild?: (requestId: string) => void;
  onDownloadBuild?: (summary: BuildJobSummary) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The publishing surface: what is out there, and the door to putting out
 * something new.
 *
 * It reports state and collects intent; every side effect belongs to the
 * caller, so the card stays renderable in a test without a store.
 */
export function ReleaseCard({
  colors,
  story,
  releases,
  preflight,
  targets,
  onTargetsChange,
  busy = false,
  onPublish,
  onSetPublished,
  onExportBundle,
  exportProgress = null,
  exportMessage = null,
  buildSettings,
  onBuildSettingsChange,
  buildSummary = null,
  buildPreparing = false,
  buildError = null,
  onBuildAndroid,
  onCancelBuild,
  onRetryBuild,
  onDownloadBuild,
  style,
}: ReleaseCardProps) {
  const { t, language } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');

  const published = useMemo(() => currentPublishedRelease(releases), [releases]);
  const highest = useMemo(() => highestReleaseVersion(releases), [releases]);
  const blockerCount = preflight?.blockers.length ?? 0;
  const canRelease = preflight !== null && blockerCount === 0 && !busy;

  // "Edited since" compares against the release, not against a saved flag: the
  // story's own updatedAt is the only thing that knows about every edit path.
  const hasUnreleasedChanges = Boolean(
    published && story.updatedAt > Date.parse(published.releasedAt),
  );

  const versionIsUsable = isNewerReleaseVersion(version, highest);

  // Exporting needs an artifact, not a showcase entry: a release the author took
  // off the showcase is still a release they can hand to someone.
  const exportable = published ?? releases.find((release) => release.version === highest) ?? null;
  const exporting = exportProgress !== null;
  const buildBusy = buildPreparing || Boolean(
    buildSummary
    && !['succeeded', 'failed', 'cancelled', 'expired'].includes(buildSummary.state)
    && !(buildSummary.needsUpload && buildError),
  );

  const openSheet = () => {
    setVersion(nextReleaseVersion(highest, 'minor'));
    setNotes('');
    setSheetOpen(true);
  };

  const status = published
    ? t('release.card.published', {
        version: published.version,
        date: formatDate(Date.parse(published.releasedAt), language, SHORT_DATE),
      })
    : highest
      ? t('release.card.unpublished', { version: highest })
      : t('release.card.noneYet');

  return (
    <View style={[styles.card, { backgroundColor: colors['surface-1'], borderColor: colors.border }, style]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(colors.primary, 0.1) }]}>
          <IconSymbol name="save" size={16} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('release.card.title')}</Text>
        {releases.length > 1 ? (
          <Text style={[styles.headerMeta, { color: colors['foreground-tertiary'] }]} numberOfLines={1}>
            {t('release.card.history', { count: releases.length })}
          </Text>
        ) : null}
      </View>

      {/* One loud line for where the story stands, one quiet line for the
          detail. The card used to stack four captions of equal weight, and none
          of them read first. */}
      <Text style={[styles.statusLead, { color: colors.foreground }]}>{status}</Text>
      {exportable?.targets ? (
        <Text style={[styles.status, { color: colors.muted }]}>
          {exportable.version}: {exportable.targets.map((target) => t(`release.target.${target}`)).join(', ')}
        </Text>
      ) : null}
      {hasUnreleasedChanges && published ? (
        <View style={[styles.notice, { backgroundColor: withAlpha(colors.warning, 0.14) }]}>
          <View style={[styles.noticeDot, { backgroundColor: colors.warning }]} />
          <Text style={[styles.status, styles.noticeText, { color: colors.foreground }]}>
            {t('release.card.unreleasedChanges', { version: published.version })}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.fieldLabel, { color: colors.muted }]}>
        {t('release.sheet.channel')}
      </Text>
      {/* Four targets as chips on one or two lines, not four full-width slabs.
          Every hint is a paragraph, so only the chosen targets spend one. */}
      <View style={styles.targetRow}>
        {RELEASE_TARGETS.map((target) => {
          const checked = targets.includes(target);
          return (
            <Pressable
              key={target}
              accessibilityRole="checkbox"
              accessibilityLabel={t(`release.target.${target}`)}
              accessibilityState={{ checked, disabled: busy }}
              aria-checked={checked}
              disabled={busy}
              onPress={() => onTargetsChange(checked
                ? (targets.length > 1 ? targets.filter((value) => value !== target) : targets)
                : [...targets, target])}
              style={({ pressed }) => [
                styles.targetChip,
                {
                  backgroundColor: checked ? withAlpha(colors.primary, 0.12) : 'transparent',
                  borderColor: checked ? colors.primary : colors['border-subtle'],
                  opacity: busy ? 0.5 : pressed ? 0.7 : 1,
                },
              ]}
            >
              {checked ? <IconSymbol name="checkmark" size={13} color={colors.primary} /> : null}
              <Text
                style={[
                  styles.targetLabel,
                  { color: checked ? colors.primary : colors['foreground-secondary'] },
                ]}
              >
                {t(`release.target.${target}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {RELEASE_TARGETS.filter((target) => targets.includes(target)).map((target) => (
        <Text key={target} style={[styles.hint, { color: colors.muted }]}>
          {t(`release.target.${target}.hint`)}
        </Text>
      ))}

      <View style={styles.actionRow}>
        <Pressable
          onPress={openSheet}
          disabled={!canRelease}
          accessibilityRole="button"
          accessibilityLabel={t('release.publish')}
          accessibilityState={{ disabled: !canRelease }}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: !canRelease ? 0.45 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <IconSymbol name="save" size={16} color={colors['text-inverse']} />
          <Text style={[styles.primaryLabel, { color: colors['text-inverse'] }]}>
            {t('release.publish')}
          </Text>
        </Pressable>

        {/* The second-order actions sit in the same strip as the primary one and
            carry a real 36pt hit area, instead of stacking as 4pt-tall bare
            text nobody reads as clickable. */}
        {onExportBundle && exportable ? (
          <Pressable
            onPress={() => onExportBundle(exportable.releaseId)}
            disabled={exporting}
            accessibilityRole="button"
            accessibilityState={{ disabled: exporting, busy: exporting }}
            accessibilityLabel={t('release.export')}
            style={({ pressed }) => [
              styles.ghostButton,
              { borderColor: colors.border, opacity: pressed || exporting ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.ghostLabel, { color: colors.foreground }]}>
              {exporting ? t(`release.export.${exportProgress}`) : t('release.export')}
            </Text>
          </Pressable>
        ) : null}

        {published ? (
          <Pressable
            onPress={() => onSetPublished(published.releaseId, false)}
            accessibilityRole="button"
            accessibilityLabel={t('release.unpublish')}
            style={({ pressed }) => [
              styles.ghostButton,
              { borderColor: colors['border-subtle'], opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.ghostLabel, { color: colors.muted }]}>{t('release.unpublish')}</Text>
          </Pressable>
        ) : highest && releases.find((release) => release.version === highest)?.targets?.includes('page') ? (
          <Pressable
            onPress={() => {
              const latest = releases.find((release) => release.version === highest);
              if (latest) onSetPublished(latest.releaseId, true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('release.republish')}
            style={({ pressed }) => [
              styles.ghostButton,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.ghostLabel, { color: colors.foreground }]}>{t('release.republish')}</Text>
          </Pressable>
        ) : null}
      </View>

      {blockerCount > 0 ? (
        <Text style={[styles.hint, { color: colors.danger }]}>
          {t('release.sheet.blockers', { count: blockerCount })}
        </Text>
      ) : null}

      {onExportBundle && exportable && !exporting && !exportMessage ? (
        <Text style={[styles.hint, { color: colors.muted }]}>{t('release.exportHint')}</Text>
      ) : null}

      {exportMessage ? (
        <Text
          style={[
            styles.hint,
            { color: exportMessage.tone === 'error' ? colors.error : colors.muted },
          ]}
        >
          {exportMessage.text}
        </Text>
      ) : null}

      {onBuildAndroid && buildSettings && exportable ? (
        <View style={[styles.buildBox, { borderColor: colors['border-subtle'] }]}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t('release.android.title')}</Text>
          <TextInput
            value={buildSettings.endpoint}
            onChangeText={(endpoint) => onBuildSettingsChange?.({ ...buildSettings, endpoint })}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('release.android.endpoint')}
            placeholder={t('release.android.endpoint')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          />
          <TextInput
            value={buildSettings.token}
            onChangeText={(token) => onBuildSettingsChange?.({ ...buildSettings, token })}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel={t('release.android.token')}
            placeholder={t('release.android.token')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          />
          <View style={styles.buildActions}>
            {(['apk', 'aab'] as const).map((target) => (
              <Pressable
                key={target}
                onPress={() => onBuildAndroid(exportable.releaseId, target)}
                disabled={buildBusy || !buildSettings.token.trim()}
                accessibilityRole="button"
                accessibilityState={{ disabled: buildBusy || !buildSettings.token.trim(), busy: buildBusy }}
                style={({ pressed }) => [styles.secondaryButton, {
                  borderColor: colors.border,
                  opacity: buildBusy || !buildSettings.token.trim() ? 0.45 : pressed ? 0.7 : 1,
                }]}
              >
                <Text style={[styles.primaryLabel, { color: colors.primary }]}>
                  {t(`release.android.build.${target}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          {buildSummary ? (
            <Text style={[styles.hint, { color: colors.muted }]}>
              {t('release.android.state', { state: t(`release.android.state.${buildSummary.state}`) })}
            </Text>
          ) : null}
          {buildBusy && buildSummary && onCancelBuild ? (
            <Pressable onPress={() => onCancelBuild(buildSummary.requestId)} style={styles.linkButton}>
              <Text style={[styles.linkLabel, { color: colors.danger }]}>{t('release.android.cancel')}</Text>
            </Pressable>
          ) : null}
          {buildSummary && ['failed', 'cancelled', 'expired'].includes(buildSummary.state) && onRetryBuild ? (
            <Pressable onPress={() => onRetryBuild(buildSummary.requestId)} style={styles.linkButton}>
              <Text style={[styles.linkLabel, { color: colors.primary }]}>{t('common.retry')}</Text>
            </Pressable>
          ) : null}
          {buildSummary?.state === 'succeeded' && buildSummary.artifact && onDownloadBuild ? (
            <Pressable onPress={() => onDownloadBuild(buildSummary)} style={styles.linkButton}>
              <Text style={[styles.linkLabel, { color: colors.primary }]}>{t('release.android.download')}</Text>
            </Pressable>
          ) : null}
          {buildError ? <Text style={[styles.hint, { color: colors.error }]}>{buildError}</Text> : null}
        </View>
      ) : null}

      <AppModal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <View style={[styles.backdrop, { backgroundColor: colors.backdrop }]}>
          <View style={[styles.sheet, { backgroundColor: colors['surface-container'] }]}>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {t('release.sheet.title')}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                {t('release.sheet.version')}
              </Text>
              <TextInput
                value={version}
                onChangeText={setVersion}
                autoCapitalize="none"
                accessibilityLabel={t('release.sheet.version')}
                style={[styles.input, {
                  color: colors.foreground,
                  borderColor: versionIsUsable ? colors.border : colors.danger,
                  backgroundColor: colors['surface-1'],
                }]}
              />
              <Text style={[styles.hint, { color: versionIsUsable ? colors.muted : colors.danger }]}>
                {highest
                  ? t('release.sheet.versionHint', { previous: highest })
                  : t('release.sheet.firstVersionHint')}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                {t('release.sheet.channel')}
              </Text>
              <Text style={[styles.hint, { color: colors['foreground-secondary'] }]}>
                {targets.map((target) => t(`release.target.${target}`)).join(', ')}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                {t('release.sheet.notes')}
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder={t('release.sheet.notesPlaceholder')}
                placeholderTextColor={colors.muted}
                accessibilityLabel={t('release.sheet.notes')}
                style={[styles.input, styles.notesInput, {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors['surface-1'],
                }]}
              />

              <View style={styles.sheetActions}>
                <Pressable
                  onPress={() => setSheetOpen(false)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.secondaryButton, {
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <Text style={[styles.primaryLabel, { color: colors.foreground }]}>
                    {t('release.sheet.cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setSheetOpen(false);
                    onPublish({ version, channel: releaseChannelForTargets(targets), targets, notes: notes.trim() || undefined });
                  }}
                  disabled={!versionIsUsable || busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !versionIsUsable || busy }}
                  style={({ pressed }) => [styles.primaryButton, styles.sheetPrimary, {
                    backgroundColor: colors.primary,
                    opacity: !versionIsUsable || busy ? 0.45 : pressed ? 0.85 : 1,
                  }]}
                >
                  <Text style={[styles.primaryLabel, { color: colors['text-inverse'] }]}>
                    {busy ? t('release.sheet.working') : t('release.sheet.confirm')}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typeScale.body,
    fontFamily: Fonts.sans,
    fontWeight: '800',
  },
  headerMeta: {
    ...typeScale.caption,
    marginLeft: 'auto',
    flexShrink: 1,
  },
  statusLead: {
    ...typeScale.label,
    fontWeight: '600',
  },
  status: {
    ...typeScale.caption,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  noticeDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  noticeText: {
    flexShrink: 1,
  },
  hint: {
    ...typeScale.caption,
  },
  targetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    height: 32,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  targetLabel: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    height: 36,
  },
  primaryLabel: {
    ...typeScale.label,
    fontWeight: '700',
  },
  ghostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
  },
  ghostLabel: {
    ...typeScale.label,
    fontWeight: '600',
  },
  linkButton: {
    paddingVertical: 4,
  },
  linkLabel: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  sheetBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: {
    ...typeScale.sectionTitle,
    fontFamily: Fonts.serif,
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    ...typeScale.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...typeScale.body,
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  buildBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  buildActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sheetPrimary: {
    marginTop: spacing.xs,
  },
});
