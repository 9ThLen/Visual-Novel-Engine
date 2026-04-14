/**
 * Keyboard Shortcut Hint Component
 * Shows keyboard shortcut hints in UI
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { getModifierKeySymbol } from '@/lib/web-utils';

interface ShortcutHintProps {
  shortcut: string;
  label?: string;
  size?: 'sm' | 'md';
}

/**
 * Display a keyboard shortcut hint
 * @example <ShortcutHint shortcut="Ctrl+S" label="Save" />
 */
export function ShortcutHint({ shortcut, label, size = 'md' }: ShortcutHintProps) {
  const colors = useColors();

  // Only show on web
  if (Platform.OS !== 'web') {
    return null;
  }

  // Replace Ctrl with platform-specific modifier
  const displayShortcut = shortcut.replace('Ctrl', getModifierKeySymbol());

  const fontSize = size === 'sm' ? 11 : 12;
  const padding = size === 'sm' ? 3 : 4;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: colors.muted, fontSize }]}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.shortcut,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingHorizontal: padding * 2,
            paddingVertical: padding,
          },
        ]}
      >
        <Text
          style={[
            styles.shortcutText,
            { color: colors.foreground, fontSize },
          ]}
        >
          {displayShortcut}
        </Text>
      </View>
    </View>
  );
}

interface ShortcutListProps {
  shortcuts: Array<{ key: string; label: string }>;
  title?: string;
}

/**
 * Display a list of keyboard shortcuts
 */
export function ShortcutList({ shortcuts, title }: ShortcutListProps) {
  const colors = useColors();

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={styles.list}>
      {title && (
        <Text style={[styles.listTitle, { color: colors.foreground }]}>
          {title}
        </Text>
      )}
      {shortcuts.map((item, index) => (
        <View key={index} style={styles.listItem}>
          <Text style={[styles.listLabel, { color: colors.foreground }]}>
            {item.label}
          </Text>
          <ShortcutHint shortcut={item.key} size="sm" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontWeight: '500',
  },
  shortcut: {
    borderRadius: 4,
    borderWidth: 1,
  },
  shortcutText: {
    fontWeight: '600',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  list: {
    gap: 8,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  listLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
});
