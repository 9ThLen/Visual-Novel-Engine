/**
 * WebSidebar Component
 * Desktop navigation sidebar for web
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { isWeb } from '@/lib/web-utils';
import { getWebLayout } from '@/lib/responsive';
import { useI18n } from '@/lib/i18n';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';

interface NavItem {
  id: string;
  labelKey: string;
  icon: IconSymbolName;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', labelKey: 'menu.home', icon: 'home', path: '/tabs' },
  { id: 'editor', labelKey: 'editor.title', icon: 'editor', path: '/editor' },
  { id: 'settings', labelKey: 'menu.settings', icon: 'settings', path: '/settings' },
];

interface WebSidebarProps {
  visible?: boolean;
}

export function WebSidebar({ visible = true }: WebSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const colors = useColors();
  const { t } = useI18n();
  const dims = useWindowDimensions();
  const layout = getWebLayout(dims);

  if (!isWeb() || !visible) {
    return null;
  }

  const handleNavigate = (path: string) => {
    router.push(path as import('expo-router').Href);
  };

  return (
    <View
      style={[
        styles.sidebar,
        {
          width: layout.sidebarWidth,
          backgroundColor: colors.surface,
          borderRightColor: colors.border,
        },
      ]}
    >
      {/* Logo/Title */}
      <View style={styles.header}>
        <IconSymbol name="book.fill" size={28} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>
          Visual Novel
        </Text>
      </View>

      {/* Navigation Items */}
      <View style={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.path || pathname.startsWith(item.path + '/');

          return (
            <Pressable
              key={item.id}
              onPress={() => handleNavigate(item.path)}
              style={({ pressed, hovered }: { pressed: boolean; hovered: boolean }) => [
                styles.navItem,
                {
                  backgroundColor: isActive
                    ? colors.primary + '15'
                    : hovered
                    ? colors.background
                    : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <IconSymbol
                name={item.icon}
                size={20}
                color={isActive ? colors.primary : colors.foreground}
                style={styles.navIcon}
              />
              <Text
                style={[
                  styles.navLabel,
                  {
                    color: isActive ? colors.primary : colors.foreground,
                    fontWeight: isActive ? '600' : '500',
                  },
                ]}
              >
                {t(item.labelKey)}
              </Text>
              {isActive && (
                <View
                  style={[
                    styles.activeIndicator,
                    { backgroundColor: colors.primary },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          v1.0.0
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    height: '100%',
    borderRightWidth: 1,
    flexDirection: 'column',
  },
  header: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  nav: {
    flex: 1,
    paddingVertical: 12,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    borderRadius: 8,
    gap: 12,
    position: 'relative',
    cursor: 'pointer',
  },
  navIcon: {
    width: 20,
  },
  navLabel: {
    fontSize: 14,
    flex: 1,
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -12,
    width: 3,
    height: 24,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
