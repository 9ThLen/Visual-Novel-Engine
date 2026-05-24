import { useWindowDimensions } from 'react-native';
import { getResponsiveValues, getGridColumns } from '@/lib/responsive';
import type { ScreenDimensions } from '@/lib/responsive';

export type DeviceType = 'phone' | 'tablet' | 'desktop';

export interface ResponsiveLayout {
  deviceType: DeviceType;
  isTablet: boolean;
  isLandscape: boolean;
  screenWidth: number;
  screenHeight: number;
  gridColumns: number;
  sidebarWidth: number;
  atomMinSize: number;
  fontSize: number;
  spacing: number;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const dims: ScreenDimensions = { width, height };
  const rv = getResponsiveValues(dims);

  const gridColumns = getGridColumns(dims);
  const sidebarWidth = rv.isTablet && rv.isLandscape ? 320 : 280;
  const atomMinSize = rv.isTablet ? 80 : 60;
  const fontSize = rv.isTablet ? 16 : 14;
  const spacing = rv.isTablet ? 16 : 12;

  return {
    deviceType: rv.isTablet ? 'tablet' : 'phone',
    isTablet: rv.isTablet,
    isLandscape: rv.isLandscape,
    screenWidth: width,
    screenHeight: height,
    gridColumns,
    sidebarWidth,
    atomMinSize,
    fontSize,
    spacing,
  };
}
