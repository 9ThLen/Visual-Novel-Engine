import React from 'react';
import { View, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { isWeb, isWebDesktop } from '@/lib/web-utils';
import { getWebLayout } from '@/lib/responsive';
import { WebSidebar } from './WebSidebar';
import { WebTopBar } from './WebTopBar';

interface DesktopLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
  showTopBar?: boolean;
  topBarTitle?: string;
  topBarBreadcrumbs?: { label: string; path?: string }[];
  topBarActions?: React.ReactNode;
}

export function DesktopLayout({
  children,
  showSidebar = true,
  showTopBar = true,
  topBarTitle,
  topBarBreadcrumbs,
  topBarActions,
}: DesktopLayoutProps) {
  const colors = useColors();
  const dims = useWindowDimensions();
  const layout = getWebLayout(dims);

  if (!isWeb() || !isWebDesktop()) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Sidebar */}
      {showSidebar && layout.showSidebar && (
        <WebSidebar visible={showSidebar} />
      )}

      {/* Main content area */}
      <View style={styles.main}>
        {/* Top bar */}
        {showTopBar && layout.showTopBar && (
          <WebTopBar
            title={topBarTitle}
            showBreadcrumbs={!!topBarBreadcrumbs}
            breadcrumbs={topBarBreadcrumbs}
            actions={topBarActions}
          />
        )}

        {/* Content */}
        <View style={styles.content}>
          {children}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    height: Platform.OS === 'web' ? ('100vh' as unknown as number) : '100%',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: Platform.OS === 'web' ? ('auto' as unknown as 'hidden') : 'hidden',
  },
});


