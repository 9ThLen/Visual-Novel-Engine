/**
 * WebTopBar Component
 * Desktop top menu bar for web
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { LanguageSelector } from './LanguageSelector';
import { ShortcutHint } from './ShortcutHint';

interface WebTopBarProps {
  title?: string;
  showBreadcrumbs?: boolean;
  breadcrumbs?: Array<{ label: string; path?: string }>;
  actions?: React.ReactNode;
}

export function WebTopBar({
  title,
  showBreadcrumbs = false,
  breadcrumbs = [],
  actions,
}: WebTopBarProps) {
  const router = useRouter();
  const colors = useColors();

  // Only render on web
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View
      style={[
        styles.topBar,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {/* Left side - Title or Breadcrumbs */}
      <View style={styles.left}>
        {showBreadcrumbs && breadcrumbs.length > 0 ? (
          <View style={styles.breadcrumbs}>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={index}>
                {crumb.path ? (
                  <Pressable
                    onPress={() => router.push(crumb.path as any)}
                    style={({ hovered }: any) => ({
                      opacity: hovered ? 0.7 : 1,
                    })}
                  >
                    <Text style={[styles.breadcrumb, { color: colors.primary }]}>
                      {crumb.label}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.breadcrumb, { color: colors.foreground }]}>
                    {crumb.label}
                  </Text>
                )}
                {index < breadcrumbs.length - 1 && (
                  <Text style={[styles.breadcrumbSeparator, { color: colors.muted }]}>
                    /
                  </Text>
                )}
              </React.Fragment>
            ))}
          </View>
        ) : title ? (
          <Text style={[styles.title, { color: colors.foreground }]}>
            {title}
          </Text>
        ) : null}
      </View>

      {/* Right side - Actions */}
      <View style={styles.right}>
        {actions}
        <View style={styles.languageContainer}>
          <LanguageSelector style={{ marginBottom: 0 }} />
        </View>
      </View>
    </View>
  );
}

interface TopBarActionProps {
  icon?: string;
  label: string;
  onPress: () => void;
  shortcut?: string;
  variant?: 'default' | 'primary';
}

export function TopBarAction({
  icon,
  label,
  onPress,
  shortcut,
  variant = 'default',
}: TopBarActionProps) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.action,
        {
          backgroundColor:
            variant === 'primary'
              ? colors.primary
              : hovered
              ? colors.background
              : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon && <Text style={styles.actionIcon}>{icon}</Text>}
      <Text
        style={[
          styles.actionLabel,
          {
            color: variant === 'primary' ? '#fff' : colors.foreground,
          },
        ]}
      >
        {label}
      </Text>
      {shortcut && <ShortcutHint shortcut={shortcut} size="sm" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breadcrumb: {
    fontSize: 14,
    fontWeight: '500',
    cursor: 'pointer',
  },
  breadcrumbSeparator: {
    fontSize: 14,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageContainer: {
    marginLeft: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    cursor: 'pointer',
  },
  actionIcon: {
    fontSize: 16,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
