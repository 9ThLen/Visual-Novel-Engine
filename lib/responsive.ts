import { Dimensions, Platform } from 'react-native';

// Web breakpoints
export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
} as const;

export const getResponsiveValues = () => {
  const { width, height } = Dimensions.get('window');

  // Determine if device is tablet (width > 600dp is typical tablet threshold)
  const isTablet = width > 600;
  const isLandscape = width > height;
  const isWeb = Platform.OS === 'web';

  // Web-specific breakpoints
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
    isNative: Platform.OS !== 'web',
    // Web-specific
    isWebMobile,
    isWebTablet,
    isWebDesktop,
    isWebLargeDesktop,
  };
};

export const getResponsiveSpacing = () => {
  const { isTablet } = getResponsiveValues();
  
  return {
    xs: isTablet ? 12 : 8,
    sm: isTablet ? 16 : 12,
    md: isTablet ? 20 : 16,
    lg: isTablet ? 28 : 20,
    xl: isTablet ? 36 : 28,
  };
};

export const getResponsiveFontSize = () => {
  const { isTablet } = getResponsiveValues();
  
  return {
    xs: isTablet ? 13 : 11,
    sm: isTablet ? 14 : 12,
    md: isTablet ? 16 : 14,
    lg: isTablet ? 20 : 16,
    xl: isTablet ? 28 : 24,
    xxl: isTablet ? 36 : 28,
  };
};

export const getReaderLayout = () => {
  const { width, height, isTablet, isLandscape } = getResponsiveValues();
  
  if (isLandscape) {
    // Landscape: split screen
    return {
      backgroundHeight: height,
      backgroundWidth: width * 0.65,
      dialogueHeight: height,
      dialogueWidth: width * 0.35,
      dialoguePosition: 'right' as const,
    };
  } else if (isTablet) {
    // Tablet portrait: more space
    return {
      backgroundHeight: height * 0.65,
      backgroundWidth: width,
      dialogueHeight: height * 0.35,
      dialogueWidth: width,
      dialoguePosition: 'bottom' as const,
    };
  } else {
    // Phone portrait: standard
    return {
      backgroundHeight: height * 0.6,
      backgroundWidth: width,
      dialogueHeight: height * 0.4,
      dialogueWidth: width,
      dialoguePosition: 'bottom' as const,
    };
  }
};

export const getGridColumns = () => {
  const { width, isTablet } = getResponsiveValues();
  
  if (isTablet && width > 1000) {
    return 3;
  } else if (isTablet) {
    return 2;
  } else {
    return 1;
  }
};

export const getMaxContentWidth = () => {
  const { width, isTablet } = getResponsiveValues();

  if (isTablet && width > 1000) {
    return 900;
  } else if (isTablet) {
    return 600;
  } else {
    return width - 32; // Full width minus padding
  }
};

// Web-specific layout configuration
export const getWebLayout = () => {
  const { width, isWebDesktop, isWebTablet, isWebMobile } = getResponsiveValues();

  if (isWebDesktop) {
    return {
      sidebarWidth: 240,
      contentMaxWidth: 1200,
      gridColumns: width > 1400 ? 3 : 2,
      showSidebar: true,
      showTopBar: true,
      editorLayout: 'split' as const, // split-screen for editor
    };
  } else if (isWebTablet) {
    return {
      sidebarWidth: 200,
      contentMaxWidth: 900,
      gridColumns: 2,
      showSidebar: false, // collapsible
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
};
