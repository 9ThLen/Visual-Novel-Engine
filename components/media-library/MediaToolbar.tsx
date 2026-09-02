/**
 * The library's one toolbar.
 *
 * The screen used to stack four full-width bands before a single file: a
 * header, the type tabs, the search field and the filter chips — around 200px
 * of chrome, all of it wide and thin, which is most of why the library read as
 * empty. The tabs and chips moved into the rail; what is left is one row.
 *
 * On a narrow screen there is no rail, so the row keeps the back button, the
 * title and `+`, and the search field takes the line below it.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppModal } from '@/components/ui/AppModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { MEDIA_SORTS, type MediaSort } from '@/lib/media-browser-rows';

export interface MenuOption {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof IconSymbol>['name'];
  selected?: boolean;
}

/**
 * One list of choices, as a sheet. Used for both the sort order and the "what
 * kind of file" question `+` has to ask in the combined view.
 */
export function MediaMenu({
  visible,
  title,
  options,
  colors,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: MenuOption[];
  colors: ThemeColorPalette;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <AppModal
      visible
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <View style={styles.menuBackdrop}>
        <Pressable style={styles.backdropFill} accessibilityRole="button" onPress={onClose} />
        <View style={[styles.menu, { backgroundColor: colors['surface-1'], borderColor: colors['border-subtle'] }]}>
          <Text style={[typeScale.label, styles.menuTitle, { color: colors.muted }]}>{title}</Text>
          {options.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => onPick(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: option.selected }}
              style={[
                styles.menuOption,
                { backgroundColor: option.selected ? colors.selected : 'transparent' },
              ]}
            >
              {option.icon ? (
                <IconSymbol
                  name={option.icon}
                  size={20}
                  color={option.selected ? colors.primary : colors.muted}
                />
              ) : null}
              <Text style={[typeScale.body, { color: colors.foreground }]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </AppModal>
  );
}

interface MediaToolbarProps {
  colors: ThemeColorPalette;
  /** The story's own name, under the screen title. */
  storyTitle?: string;
  query: string;
  onChangeQuery: (query: string) => void;
  sort: MediaSort;
  onChangeSort: (sort: MediaSort) => void;
  dense: boolean;
  onToggleDense: () => void;
  onBack: () => void;
  onAdd: () => void;
  /** Narrow screens put the search field on its own line. */
  compact: boolean;
}

export function MediaToolbar({
  colors,
  storyTitle,
  query,
  onChangeQuery,
  sort,
  onChangeSort,
  dense,
  onToggleDense,
  onBack,
  onAdd,
  compact,
}: MediaToolbarProps) {
  const { t } = useI18n();
  const [sortOpen, setSortOpen] = React.useState(false);

  const search = (
    <View
      style={[
        styles.search,
        compact ? styles.searchWide : styles.searchInline,
        { borderColor: colors['border-subtle'], backgroundColor: colors.background },
      ]}
    >
      <IconSymbol name="search" size={16} color={colors.muted} />
      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        placeholder={t('mediaLibrary.search.placeholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('mediaLibrary.search.placeholder')}
        style={[styles.input, { color: colors.foreground }]}
      />
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('menu.back')}
          style={styles.iconButton}
        >
          <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
        </Pressable>

        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
            {t('mediaLibrary.title')}
          </Text>
          {storyTitle ? (
            <Text numberOfLines={1} style={[typeScale.micro, { color: colors.muted }]}>{storyTitle}</Text>
          ) : null}
        </View>

        {compact ? null : search}

        {compact ? null : (
          <>
            <Pressable
              onPress={() => setSortOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('mediaLibrary.sort.label')}
              style={styles.iconButton}
            >
              <IconSymbol name="sort" size={20} color={colors['foreground-secondary']} />
            </Pressable>
            <Pressable
              onPress={onToggleDense}
              accessibilityRole="button"
              accessibilityLabel={t(dense ? 'mediaLibrary.density.comfortable' : 'mediaLibrary.density.dense')}
              accessibilityState={{ selected: dense }}
              style={styles.iconButton}
            >
              <IconSymbol name="density" size={20} color={dense ? colors.primary : colors['foreground-secondary']} />
            </Pressable>
          </>
        )}

        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={t('mediaLibrary.add')}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
        >
          <IconSymbol name="add" size={20} color={colors['foreground-on-primary']} />
        </Pressable>
      </View>

      {compact ? search : null}

      <MediaMenu
        visible={sortOpen}
        title={t('mediaLibrary.sort.label')}
        colors={colors}
        options={MEDIA_SORTS.map((value) => ({
          key: value,
          label: t(`mediaLibrary.sort.${value}`),
          selected: value === sort,
        }))}
        onPick={(key) => {
          setSortOpen(false);
          onChangeSort(key as MediaSort);
        }}
        onClose={() => setSortOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { ...typeScale.sectionTitle },
  addButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  searchInline: { flex: 1, maxWidth: 320 },
  searchWide: { flex: 0 },
  input: { flex: 1, minWidth: 0, ...typeScale.body },

  menuBackdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  menu: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: 2,
  },
  menuTitle: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
});
