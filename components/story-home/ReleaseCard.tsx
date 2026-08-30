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
import { SegmentedControl } from '@/components/ui/SegmentedControl';
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
import type { ReleaseChannel } from '@/lib/release/types';
import { isNewerReleaseVersion, nextReleaseVersion } from '@/lib/release/version';
import type { StoryMetadata } from '@/lib/story-domain';

export interface PublishRequest {
  version: string;
  channel: ReleaseChannel;
  notes?: string;
}

export const RELEASE_CHANNEL_OPTIONS: readonly ReleaseChannel[] = ['page', 'app', 'both'];

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
  channel: ReleaseChannel;
  onChannelChange: (channel: ReleaseChannel) => void;
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
  channel,
  onChannelChange,
  busy = false,
  onPublish,
  onSetPublished,
  onExportBundle,
  exportProgress = null,
  exportMessage = null,
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
      </View>

      <Text style={[styles.status, { color: colors.muted }]}>{status}</Text>
      {hasUnreleasedChanges && published ? (
        <Text style={[styles.status, { color: colors.warning }]}>
          {t('release.card.unreleasedChanges', { version: published.version })}
        </Text>
      ) : null}
      {releases.length > 1 ? (
        <Text style={[styles.status, { color: colors.muted }]}>
          {t('release.card.history', { count: releases.length })}
        </Text>
      ) : null}

      <Text style={[styles.fieldLabel, { color: colors.muted }]}>
        {t('release.sheet.channel')}
      </Text>
      <SegmentedControl<ReleaseChannel>
        options={RELEASE_CHANNEL_OPTIONS.map((option) => ({
          value: option,
          label: t(`release.sheet.channel.${option}`),
        }))}
        value={channel}
        onChange={onChannelChange}
        accessibilityLabel={t('release.sheet.channel')}
        segmentMinWidth={78}
      />

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

      {blockerCount > 0 ? (
        <Text style={[styles.hint, { color: colors.muted }]}>
          {t('release.sheet.blockers', { count: blockerCount })}
        </Text>
      ) : null}

      {published ? (
        <Pressable
          onPress={() => onSetPublished(published.releaseId, false)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.linkLabel, { color: colors.muted }]}>{t('release.unpublish')}</Text>
        </Pressable>
      ) : highest ? (
        <Pressable
          onPress={() => {
            const latest = releases.find((release) => release.version === highest);
            if (latest) onSetPublished(latest.releaseId, true);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.linkLabel, { color: colors.primary }]}>{t('release.republish')}</Text>
        </Pressable>
      ) : null}

      {onExportBundle && exportable ? (
        <Pressable
          onPress={() => onExportBundle(exportable.releaseId)}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityState={{ disabled: exporting, busy: exporting }}
          accessibilityLabel={t('release.export')}
          style={({ pressed }) => [styles.linkButton, { opacity: pressed || exporting ? 0.7 : 1 }]}
        >
          <Text style={[styles.linkLabel, { color: colors.primary }]}>
            {exporting ? t(`release.export.${exportProgress}`) : t('release.export')}
          </Text>
        </Pressable>
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
                {t(`release.sheet.channel.${channel}`)}
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
                    onPublish({ version, channel, notes: notes.trim() || undefined });
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
  status: {
    ...typeScale.caption,
  },
  hint: {
    ...typeScale.caption,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: spacing.xs,
  },
  primaryLabel: {
    ...typeScale.label,
    fontWeight: '700',
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
  sheetPrimary: {
    marginTop: spacing.xs,
  },
});
