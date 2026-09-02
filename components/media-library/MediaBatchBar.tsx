/**
 * What select mode is for: the bar that appears once files are ticked.
 *
 * Clearing twelve unused backgrounds used to be twelve rounds of select →
 * inspector → delete → confirm. The actions here are the inspector's, applied
 * to everything ticked at once.
 *
 * Delete counts what it can actually delete. Story membership is re-derived
 * from scene references on every hydration, so removing a file a scene still
 * names does not survive a restart — the honest button is one that names the
 * smaller number and says why.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';

interface MediaBatchBarProps {
  colors: ThemeColorPalette;
  /** How many files are ticked. */
  count: number;
  /** How many of them the library may actually remove from the story. */
  removableCount: number;
  /** Whether every ticked file is an image, which the image actions need. */
  imagesOnly: boolean;
  canRemoveBackground: boolean;
  /** False while the scenes are still being read: usage is not known yet. */
  usageReady: boolean;
  busy: boolean;
  onAttachToCharacter: () => void;
  onRemoveBackground: () => void;
  onRemove: () => void;
  onClear: () => void;
}

export function MediaBatchBar({
  colors,
  count,
  removableCount,
  imagesOnly,
  canRemoveBackground,
  usageReady,
  busy,
  onAttachToCharacter,
  onRemoveBackground,
  onRemove,
  onClear,
}: MediaBatchBarProps) {
  const { t, pluralize } = useI18n();

  const action = (options: {
    key: string;
    label: string;
    icon: React.ComponentProps<typeof IconSymbol>['name'];
    onPress: () => void;
    tint?: string;
    disabled?: boolean;
  }) => (
    <Pressable
      key={options.key}
      onPress={options.onPress}
      disabled={options.disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: options.disabled || busy }}
      style={[
        styles.action,
        {
          borderColor: options.tint ?? colors.border,
          opacity: options.disabled || busy ? 0.45 : 1,
        },
      ]}
    >
      <IconSymbol name={options.icon} size={17} color={options.tint ?? colors.foreground} />
      <Text style={[typeScale.label, { color: options.tint ?? colors.foreground }]}>{options.label}</Text>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors['surface-elevated'], borderColor: colors['border-subtle'] },
      ]}
    >
      <Text style={[typeScale.label, styles.count, { color: colors.foreground }]}>
        {t('mediaLibrary.batch.selected', {
          count,
          files: pluralize(
            count,
            t('mediaLibrary.overview.fileOne'),
            t('mediaLibrary.overview.fileFew'),
            t('mediaLibrary.overview.fileMany'),
          ),
        })}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.actionsScroll}
        contentContainerStyle={styles.actions}
      >
        {imagesOnly ? action({
          key: 'attach',
          label: t('mediaLibrary.action.addToCharacter'),
          icon: 'character',
          onPress: onAttachToCharacter,
        }) : null}
        {imagesOnly && canRemoveBackground ? action({
          key: 'cutout',
          label: t('mediaLibrary.action.removeBackground'),
          icon: 'scissors',
          onPress: onRemoveBackground,
        }) : null}
        {action({
          key: 'remove',
          // The number on the button is what pressing it will actually do.
          label: t('mediaLibrary.batch.remove', { count: removableCount }),
          icon: 'delete',
          onPress: onRemove,
          tint: colors.danger,
          disabled: !usageReady || removableCount === 0,
        })}
        {action({
          key: 'clear',
          label: t('common.cancel'),
          icon: 'close',
          onPress: onClear,
        })}
      </ScrollView>

      {usageReady && removableCount < count ? (
        <Text style={[typeScale.micro, styles.note, { color: colors.muted }]}>
          {t('mediaLibrary.batch.blocked', { count: count - removableCount })}
        </Text>
      ) : null}
      {usageReady ? null : (
        <Text style={[typeScale.micro, styles.note, { color: colors.muted }]}>
          {t('mediaLibrary.usagePending')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  count: {},
  // A ScrollView grows by default, which here would push the browser off the
  // screen; the bar is as tall as its one row of buttons.
  actionsScroll: { flexGrow: 0, flexShrink: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.full,
  },
  note: {},
});
