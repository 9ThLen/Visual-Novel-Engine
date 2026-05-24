import { Platform } from 'react-native';

export interface ScreenDimensions {
  width: number;
  height: number;
  isWeb?: boolean;
}

export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
} as const;

export function getResponsiveValues(dims: ScreenDimensions) {
  const { width, height, isWeb = Platform.OS === 'web' } = dims;
  const isTablet = width >= BREAKPOINTS.mobile || (width >= 600 && height >= 600);
  const isLandscape = width > height;

  const isWebMobile = isWeb && width < BREAKPOINTS.mobile;
  const isWebTablet = isWeb && width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet;
  const isWebDesktop = isWeb && width >= BREAKPOINTS.tablet;
  const isWebLargeDesktop = isWeb && width >= BREAKPOINTS.desktop;

  return {
    width,
    height,
    isTablet,
    isLandscape,
    isWeb,
    isNative: !isWeb,
    isWebMobile,
    isWebTablet,
    isWebDesktop,
    isWebLargeDesktop,
  };
}

export function getResponsiveSpacing(dims: ScreenDimensions) {
  const { isTablet } = getResponsiveValues(dims);

  return {
    xs: isTablet ? 12 : 8,
    sm: isTablet ? 16 : 12,
    md: isTablet ? 20 : 16,
    lg: isTablet ? 28 : 20,
    xl: isTablet ? 36 : 28,
  };
}

export function getResponsiveFontSize(dims: ScreenDimensions) {
  const { isTablet } = getResponsiveValues(dims);

  return {
    xs: isTablet ? 13 : 11,
    sm: isTablet ? 14 : 12,
    md: isTablet ? 16 : 14,
    lg: isTablet ? 20 : 16,
    xl: isTablet ? 28 : 24,
    xxl: isTablet ? 36 : 28,
  };
}

export function getReaderLayout(dims: ScreenDimensions) {
  const { width, height, isTablet, isLandscape } = getResponsiveValues(dims);

  if (isLandscape) {
    return {
      backgroundHeight: height,
      backgroundWidth: width * 0.65,
      dialogueHeight: height,
      dialogueWidth: width * 0.35,
      dialoguePosition: 'right' as const,
    };
  } else if (isTablet) {
    return {
      backgroundHeight: height * 0.65,
      backgroundWidth: width,
      dialogueHeight: height * 0.35,
      dialogueWidth: width,
      dialoguePosition: 'bottom' as const,
    };
  } else {
    return {
      backgroundHeight: height * 0.6,
      backgroundWidth: width,
      dialogueHeight: height * 0.4,
      dialogueWidth: width,
      dialoguePosition: 'bottom' as const,
    };
  }
}

export function getGridColumns(dims: ScreenDimensions) {
  const { width, isTablet } = getResponsiveValues(dims);

  if (isTablet && width >= BREAKPOINTS.tablet) {
    return 4;
  } else if (isTablet) {
    return 3;
  } else {
    return 2;
  }
}

export function getMaxContentWidth(dims: ScreenDimensions) {
  const { width, isTablet } = getResponsiveValues(dims);

  if (isTablet && width > BREAKPOINTS.tablet) {
    return 900;
  } else if (isTablet) {
    return 600;
  } else {
    return width - 32;
  }
}

export function getWebLayout(dims: ScreenDimensions) {
  const { width, isWebDesktop, isWebTablet, isWebMobile } = getResponsiveValues(dims);

  if (isWebDesktop) {
    return {
      sidebarWidth: 240,
      contentMaxWidth: 1200,
      gridColumns: width > 1400 ? 3 : 2,
      showSidebar: true,
      showTopBar: true,
      editorLayout: 'split' as const,
    };
  } else if (isWebTablet) {
    return {
      sidebarWidth: 200,
      contentMaxWidth: 900,
      gridColumns: 2,
      showSidebar: false,
      showTopBar: true,
      editorLayout: 'stacked' as const,
    };
  } else {
    return {
      sidebarWidth: 0,
      contentMaxWidth: width - 32,
      gridColumns: 1,
      showSidebar: false,
      showTopBar: false,
      editorLayout: 'stacked' as const,
    };
  }
}
