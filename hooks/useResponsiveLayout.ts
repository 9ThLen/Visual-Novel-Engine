import { useWindowDimensions, Platform } from 'react-native';

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
  const isLandscape = width > height;
  
  // Tablet detection: width > 768px or both dimensions > 600px
  const isTablet = width >= 768 || (width >= 600 && height >= 600);
  const deviceType: DeviceType = isTablet ? 'tablet' : 'phone';
  
  // Grid columns based on screen width
  let gridColumns = 2;
  if (width >= 1024) gridColumns = 4;
  else if (width >= 768) gridColumns = 3;
  
  // Sidebar width for tablets in landscape
  const sidebarWidth = isTablet && isLandscape ? 320 : 280;
  
  // Minimum atom size (larger on tablets for touch)
  const atomMinSize = isTablet ? 80 : 60;
  
  // Font scaling
  const fontSize = isTablet ? 16 : 14;
  
  // Spacing
  const spacing = isTablet ? 16 : 12;
  
  return {
    deviceType,
    isTablet,
    isLandscape,
    screenWidth: width,
    screenHeight: height,
    gridColumns,
    sidebarWidth,
    atomMinSize,
    fontSize,
    spacing,
  };
}
