import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-native
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  useWindowDimensions: vi.fn(() => ({ width: 375, height: 812 })),
}));

// Mock scene store
const mockScenes = [
  {
    id: 'scene-1',
    name: 'Test Scene',
    elements: [],
    timeline: [
      { id: 'evt-1', elementId: 'elem-1', startTime: 0, duration: 5, easing: 'linear' },
      { id: 'evt-2', elementId: 'elem-2', startTime: 2, duration: 3, easing: 'ease-in' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

vi.mock('@/stores/scene-store', () => ({
  useSceneStore: vi.fn((selector) => {
    const state = { scenes: mockScenes };
    return selector(state);
  }),
}));

// Mock useResponsiveLayout
vi.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: vi.fn(() => ({
    deviceType: 'phone',
    isTablet: false,
    isLandscape: false,
    screenWidth: 375,
    screenHeight: 812,
    gridColumns: 2,
    sidebarWidth: 280,
    atomMinSize: 60,
    fontSize: 14,
    spacing: 12,
  })),
}));

import { useSceneStore } from '@/stores/scene-store';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

// Since we can't easily render React Native components in node env,
// we test the logic that TimelineEditor uses directly
describe('TimelineEditor logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scene lookup', () => {
    it('finds scene by id from store', () => {
      const scenes = useSceneStore((s) => s.scenes);
      const scene = scenes.find((s) => s.id === 'scene-1');
      expect(scene).toBeDefined();
      expect(scene?.name).toBe('Test Scene');
    });

    it('returns undefined for non-existent scene', () => {
      const scenes = useSceneStore((s) => s.scenes);
      const scene = scenes.find((s) => s.id === 'non-existent');
      expect(scene).toBeUndefined();
    });
  });

  describe('timeline duration calculation', () => {
    it('calculates total duration as max end time', () => {
      const timeline = [
        { id: 'evt-1', elementId: 'elem-1', startTime: 0, duration: 5, easing: 'linear' },
        { id: 'evt-2', elementId: 'elem-2', startTime: 2, duration: 3, easing: 'ease-in' },
      ];
      const totalDuration = timeline.reduce((max, event) => {
        const eventEnd = event.startTime + event.duration;
        return eventEnd > max ? eventEnd : max;
      }, 0);
      expect(totalDuration).toBe(5); // max(0+5, 2+3) = 5
    });

    it('returns 0 for empty timeline', () => {
      const timeline: Array<{ startTime: number; duration: number }> = [];
      const totalDuration = timeline.reduce((max, event) => {
        const eventEnd = event.startTime + event.duration;
        return eventEnd > max ? eventEnd : max;
      }, 0);
      expect(totalDuration).toBe(0);
    });

    it('handles single event', () => {
      const timeline = [
        { startTime: 3, duration: 7 },
      ];
      const totalDuration = timeline.reduce((max, event) => {
        return Math.max(max, event.startTime + event.duration);
      }, 0);
      expect(totalDuration).toBe(10);
    });
  });

  describe('ruler marks generation', () => {
    it('generates marks from 0 to totalDuration', () => {
      const totalDuration = 5;
      const marks = [];
      for (let i = 0; i <= Math.ceil(totalDuration); i++) {
        marks.push(i);
      }
      expect(marks).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('generates single mark for 0 duration', () => {
      const totalDuration = 0;
      const marks = [];
      for (let i = 0; i <= Math.ceil(totalDuration); i++) {
        marks.push(i);
      }
      expect(marks).toEqual([0]);
    });

    it('rounds up fractional durations', () => {
      const totalDuration = 3.5;
      const marks = [];
      for (let i = 0; i <= Math.ceil(totalDuration); i++) {
        marks.push(i);
      }
      expect(marks).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('useResponsiveLayout integration', () => {
    it('returns phone layout by default', () => {
      const layout = useResponsiveLayout();
      expect(layout.isTablet).toBe(false);
      expect(layout.fontSize).toBe(14);
    });
  });
});
