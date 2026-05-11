import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-native before importing the hook
vi.mock('react-native', () => ({
  useWindowDimensions: vi.fn(),
  Platform: { OS: 'ios' },
}));

import { useWindowDimensions } from 'react-native';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

const mockDimensions = useWindowDimensions as ReturnType<typeof vi.fn>;

describe('useResponsiveLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('phone detection', () => {
    it('returns phone for iPhone-like width (375x812)', () => {
      mockDimensions.mockReturnValue({ width: 375, height: 812 });
      const layout = useResponsiveLayout();
      expect(layout.deviceType).toBe('phone');
      expect(layout.isTablet).toBe(false);
    });

    it('returns phone for small Android (360x640)', () => {
      mockDimensions.mockReturnValue({ width: 360, height: 640 });
      const layout = useResponsiveLayout();
      expect(layout.deviceType).toBe('phone');
    });
  });

  describe('tablet detection', () => {
    it('returns tablet for iPad-like width (768x1024)', () => {
      mockDimensions.mockReturnValue({ width: 768, height: 1024 });
      const layout = useResponsiveLayout();
      expect(layout.deviceType).toBe('tablet');
      expect(layout.isTablet).toBe(true);
    });

    it('returns tablet for iPad Pro width (1024x1366)', () => {
      mockDimensions.mockReturnValue({ width: 1024, height: 1366 });
      const layout = useResponsiveLayout();
      expect(layout.deviceType).toBe('tablet');
    });

    it('returns tablet when both dimensions >= 600', () => {
      mockDimensions.mockReturnValue({ width: 600, height: 600 });
      const layout = useResponsiveLayout();
      expect(layout.isTablet).toBe(true);
    });

    it('returns phone when only one dimension >= 600', () => {
      mockDimensions.mockReturnValue({ width: 400, height: 700 });
      const layout = useResponsiveLayout();
      expect(layout.isTablet).toBe(false);
    });
  });

  describe('isLandscape', () => {
    it('returns true when width > height', () => {
      mockDimensions.mockReturnValue({ width: 1024, height: 768 });
      const layout = useResponsiveLayout();
      expect(layout.isLandscape).toBe(true);
    });

    it('returns false when height > width', () => {
      mockDimensions.mockReturnValue({ width: 768, height: 1024 });
      const layout = useResponsiveLayout();
      expect(layout.isLandscape).toBe(false);
    });

    it('returns false when width equals height', () => {
      mockDimensions.mockReturnValue({ width: 800, height: 800 });
      const layout = useResponsiveLayout();
      expect(layout.isLandscape).toBe(false);
    });
  });

  describe('gridColumns', () => {
    it('returns 2 columns for phone width (<768)', () => {
      mockDimensions.mockReturnValue({ width: 375, height: 812 });
      const layout = useResponsiveLayout();
      expect(layout.gridColumns).toBe(2);
    });

    it('returns 3 columns for tablet width (>=768, <1024)', () => {
      mockDimensions.mockReturnValue({ width: 768, height: 1024 });
      const layout = useResponsiveLayout();
      expect(layout.gridColumns).toBe(3);
    });

    it('returns 4 columns for large tablet width (>=1024)', () => {
      mockDimensions.mockReturnValue({ width: 1024, height: 768 });
      const layout = useResponsiveLayout();
      expect(layout.gridColumns).toBe(4);
    });
  });

  describe('adaptive values', () => {
    it('returns smaller sidebarWidth for phone (280)', () => {
      mockDimensions.mockReturnValue({ width: 375, height: 812 });
      const layout = useResponsiveLayout();
      expect(layout.sidebarWidth).toBe(280);
    });

    it('returns larger sidebarWidth for tablet in landscape (320)', () => {
      mockDimensions.mockReturnValue({ width: 1024, height: 768 });
      const layout = useResponsiveLayout();
      expect(layout.sidebarWidth).toBe(320);
    });

    it('returns 280 sidebar for tablet in portrait', () => {
      mockDimensions.mockReturnValue({ width: 768, height: 1024 });
      const layout = useResponsiveLayout();
      expect(layout.sidebarWidth).toBe(280);
    });

    it('returns larger atomMinSize for tablet (80 vs 60)', () => {
      mockDimensions.mockReturnValue({ width: 375, height: 812 });
      const phoneLayout = useResponsiveLayout();
      mockDimensions.mockReturnValue({ width: 768, height: 1024 });
      const tabletLayout = useResponsiveLayout();
      expect(phoneLayout.atomMinSize).toBe(60);
      expect(tabletLayout.atomMinSize).toBe(80);
    });

    it('returns larger fontSize for tablet (16 vs 14)', () => {
      mockDimensions.mockReturnValue({ width: 375, height: 812 });
      const phoneLayout = useResponsiveLayout();
      mockDimensions.mockReturnValue({ width: 768, height: 1024 });
      const tabletLayout = useResponsiveLayout();
      expect(phoneLayout.fontSize).toBe(14);
      expect(tabletLayout.fontSize).toBe(16);
    });

    it('returns larger spacing for tablet (16 vs 12)', () => {
      mockDimensions.mockReturnValue({ width: 375, height: 812 });
      const phoneLayout = useResponsiveLayout();
      mockDimensions.mockReturnValue({ width: 768, height: 1024 });
      const tabletLayout = useResponsiveLayout();
      expect(phoneLayout.spacing).toBe(12);
      expect(tabletLayout.spacing).toBe(16);
    });
  });

  describe('screenWidth and screenHeight', () => {
    it('passes through dimension values', () => {
      mockDimensions.mockReturnValue({ width: 500, height: 900 });
      const layout = useResponsiveLayout();
      expect(layout.screenWidth).toBe(500);
      expect(layout.screenHeight).toBe(900);
    });
  });
});
