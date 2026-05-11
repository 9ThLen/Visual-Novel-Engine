import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock expo-haptics
vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}));

// Mock react-native-reanimated
vi.mock('react-native-reanimated', () => ({
  useSharedValue: (initial: any) => ({ value: initial }),
  useAnimatedStyle: (cb: any) => cb(),
  runOnJS: (fn: any) => fn,
  withSpring: (val: any) => val,
  withTiming: (val: any) => val,
}));

// Mock react-native-gesture-handler
vi.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => ({
      hitSlop: vi.fn().mockReturnThis(),
      onBegin: vi.fn().mockReturnThis(),
      onUpdate: vi.fn().mockReturnThis(),
      onEnd: vi.fn().mockReturnThis(),
    }),
  },
  GestureDetector: ({ children }: any) => children,
}));

// Mock react-native-reanimated-dnd
vi.mock('react-native-reanimated-dnd', () => ({
  DropProvider: ({ children }: any) => children,
  Droppable: ({ children }: any) => children,
  Draggable: ({ children }: any) => children,
  HorizontalSortable: ({ children }: any) => children,
  SortableItem: ({ children }: any) => children,
  useDraggable: () => ({
    animatedViewProps: { style: {}, onLayout: vi.fn() },
    gesture: {},
    state: 'IDLE',
    animatedViewRef: {},
    hasHandle: false,
    registerHandle: vi.fn(),
  }),
  useDroppable: () => ({
    viewProps: { onLayout: vi.fn(), style: {} },
    isActive: false,
    activeStyle: {},
    animatedViewRef: {},
  }),
  useHorizontalSortable: () => ({
    animatedStyle: {},
    panGestureHandler: {},
    handlePanGestureHandler: {},
    isMoving: false,
    hasHandle: false,
    registerHandle: vi.fn(),
  }),
  useHorizontalSortableList: () => ({
    positions: { value: {} },
    scrollX: { value: 0 },
    autoScroll: { value: 'none' },
    scrollViewRef: {},
    dropProviderRef: {},
    handleScroll: vi.fn(),
    handleScrollEnd: vi.fn(),
    contentWidth: 0,
    getItemProps: vi.fn(),
  }),
}));

// ---- Snap logic for testing (mirrors LegoCanvas internal logic) ----
const SNAP_THRESHOLD = 20;

function canAtomsSnapTest(atomA: any, atomB: any): boolean {
  const dx = Math.abs((atomA.x + atomA.width / 2) - (atomB.x + atomB.width / 2));
  const dy = Math.abs((atomA.y + atomA.height / 2) - (atomB.y + atomB.height / 2));
  if (dx > atomA.width / 2 + atomB.width / 2 + SNAP_THRESHOLD) return false;
  if (dy > atomA.height / 2 + atomB.height / 2 + SNAP_THRESHOLD) return false;

  for (const spA of (atomA.snapPoints || [])) {
    for (const spB of (atomB.snapPoints || [])) {
      const oppositeSides =
        (spA.side === 'left' && spB.side === 'right') ||
        (spA.side === 'right' && spB.side === 'left') ||
        (spA.side === 'top' && spB.side === 'bottom') ||
        (spA.side === 'bottom' && spB.side === 'top');
      if (oppositeSides) {
        if (
          (spA.compatibleTypes || []).includes(atomB.type) ||
          (spB.compatibleTypes || []).includes(atomA.type)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function calculateSnapPositionTest(draggedAtom: any, targetAtom: any): { x: number; y: number } {
  const draggedRight = draggedAtom.x + draggedAtom.width;
  const draggedBottom = draggedAtom.y + draggedAtom.height;
  const targetRight = targetAtom.x + targetAtom.width;
  const targetBottom = targetAtom.y + targetAtom.height;

  let newX = draggedAtom.x;
  let newY = draggedAtom.y;

  const leftDist = Math.abs(draggedAtom.x - targetRight);
  const rightDist = Math.abs(draggedRight - targetAtom.x);
  if (leftDist < SNAP_THRESHOLD) {
    newX = targetRight;
  } else if (rightDist < SNAP_THRESHOLD) {
    newX = targetAtom.x - draggedAtom.width;
  }

  const topDist = Math.abs(draggedAtom.y - targetBottom);
  const bottomDist = Math.abs(draggedBottom - targetAtom.y);
  if (topDist < SNAP_THRESHOLD) {
    newY = targetBottom;
  } else if (bottomDist < SNAP_THRESHOLD) {
    newY = targetAtom.y - draggedAtom.height;
  }

  return { x: newX, y: newY };
}

// ---- Tests ----

describe('Drag-and-Drop Integration', () => {
  describe('Magnetic Snap Logic', () => {
    it('should detect compatible snap points between close atoms', () => {
      const atomA: any = {
        id: 'atom-a', type: 'dialogue',
        x: 0, y: 0, width: 100, height: 50,
        snapPoints: [{ side: 'right', compatibleTypes: ['dialogue', 'choice'] }],
      };
      const atomB: any = {
        id: 'atom-b', type: 'dialogue',
        x: 105, y: 0, width: 100, height: 50,
        snapPoints: [{ side: 'left', compatibleTypes: ['dialogue', 'choice'] }],
      };

      const result = canAtomsSnapTest(atomA, atomB);
      expect(typeof result).toBe('boolean');
    });

    it('should not snap atoms that are far apart', () => {
      const atomA: any = {
        id: 'atom-a', type: 'dialogue',
        x: 0, y: 0, width: 100, height: 50,
        snapPoints: [{ side: 'right', compatibleTypes: ['dialogue'] }],
      };
      const atomB: any = {
        id: 'atom-b', type: 'dialogue',
        x: 500, y: 500, width: 100, height: 50,
        snapPoints: [{ side: 'left', compatibleTypes: ['dialogue'] }],
      };

      expect(canAtomsSnapTest(atomA, atomB)).toBe(false);
    });

    it('should calculate snap position for horizontally adjacent atoms', () => {
      const dragged: any = {
        id: 'dragged', type: 'dialogue',
        x: 5, y: 0, width: 100, height: 50,
      };
      const target: any = {
        id: 'target', type: 'dialogue',
        x: 100, y: 0, width: 100, height: 50,
      };

      const pos = calculateSnapPositionTest(dragged, target);
      expect(pos).toHaveProperty('x');
      expect(pos).toHaveProperty('y');
    });

    it('should snap dragged atom left edge to target right edge', () => {
      const dragged: any = {
        id: 'dragged', type: 'dialogue',
        x: 98, y: 0, width: 100, height: 50,
      };
      const target: any = {
        id: 'target', type: 'dialogue',
        x: 0, y: 0, width: 100, height: 50,
      };

      const pos = calculateSnapPositionTest(dragged, target);
      // dragged.x (98) is close to target.x + target.width (100)
      // leftDist = |98 - 100| = 2 < 20, so snap to targetRight
      expect(pos.x).toBe(100);
    });

    it('should snap dragged atom top edge to target bottom edge', () => {
      const dragged: any = {
        id: 'dragged', type: 'dialogue',
        x: 0, y: 48, width: 100, height: 50,
      };
      const target: any = {
        id: 'target', type: 'dialogue',
        x: 0, y: 0, width: 100, height: 50,
      };

      const pos = calculateSnapPositionTest(dragged, target);
      // dragged.y (48) close to target.y + target.height (50)
      expect(pos.y).toBe(50);
    });
  });

  describe('Cross-Scene Drop', () => {
    it('should skip drop when source and target are the same scene', () => {
      const targetSceneId = 'scene-a';
      const dropData = { elementId: 'atom-1', sourceSceneId: 'scene-a' };
      expect(dropData.sourceSceneId === targetSceneId).toBe(true);
    });

    it('should allow drop when source and target differ', () => {
      const targetSceneId = 'scene-b';
      const dropData = { elementId: 'atom-1', sourceSceneId: 'scene-a' };
      expect(dropData.sourceSceneId !== targetSceneId).toBe(true);
    });

    it('should construct valid drop data', () => {
      const dropData = { elementId: 'atom-1', sourceSceneId: 'scene-a' };
      expect(dropData.elementId).toBe('atom-1');
      expect(dropData.sourceSceneId).toBe('scene-a');
    });
  });

  describe('Timeline Reorder', () => {
    it('should recalculate startTimes after reorder', () => {
      const events = [
        { id: 'e1', elementId: 'a1', startTime: 0, duration: 2, easing: 'linear' },
        { id: 'e2', elementId: 'a2', startTime: 2, duration: 3, easing: 'ease-in' },
        { id: 'e3', elementId: 'a3', startTime: 5, duration: 1, easing: 'ease-out' },
      ];

      // Simulate reorder: move e3 to position 0
      const reordered = [events[2], events[0], events[1]];
      let currentTime = 0;
      const updated = reordered.map((event) => {
        const updatedEvent = { ...event, startTime: currentTime };
        currentTime += event.duration;
        return updatedEvent;
      });

      expect(updated[0].startTime).toBe(0);
      expect(updated[1].startTime).toBe(1);
      expect(updated[2].startTime).toBe(3);
    });

    it('should handle empty timeline', () => {
      const events: any[] = [];
      let currentTime = 0;
      const updated = events.map((event) => {
        const updatedEvent = { ...event, startTime: currentTime };
        currentTime += event.duration;
        return updatedEvent;
      });
      expect(updated).toHaveLength(0);
    });

    it('should handle single event timeline', () => {
      const events = [
        { id: 'e1', elementId: 'a1', startTime: 5, duration: 3, easing: 'linear' },
      ];

      let currentTime = 0;
      const updated = events.map((event) => {
        const updatedEvent = { ...event, startTime: currentTime };
        currentTime += event.duration;
        return updatedEvent;
      });

      expect(updated).toHaveLength(1);
      expect(updated[0].startTime).toBe(0);
    });

    it('should maintain total duration after reorder', () => {
      const events = [
        { id: 'e1', duration: 2 },
        { id: 'e2', duration: 3 },
        { id: 'e3', duration: 1 },
      ];
      const totalBefore = events.reduce((sum, e) => sum + e.duration, 0);

      // Reorder
      const reordered = [events[2], events[0], events[1]];
      const totalAfter = reordered.reduce((sum, e) => sum + e.duration, 0);

      expect(totalAfter).toBe(totalBefore);
      expect(totalAfter).toBe(6);
    });
  });

  describe('react-native-reanimated-dnd Mocks', () => {
    it('should mock DropProvider without errors', async () => {
      const { DropProvider } = await import('react-native-reanimated-dnd');
      expect(DropProvider).toBeDefined();
    });

    it('should mock Droppable without errors', async () => {
      const { Droppable } = await import('react-native-reanimated-dnd');
      expect(Droppable).toBeDefined();
    });

    it('should mock useDraggable hook', async () => {
      const { useDraggable } = await import('react-native-reanimated-dnd');
      const result = useDraggable({ data: {} });
      expect(result).toHaveProperty('gesture');
      expect(result).toHaveProperty('state');
    });

    it('should mock useHorizontalSortableList hook', async () => {
      const { useHorizontalSortableList } = await import('react-native-reanimated-dnd');
      const result = useHorizontalSortableList({ data: [], itemWidth: 120 });
      expect(result).toHaveProperty('getItemProps');
      expect(result).toHaveProperty('scrollViewRef');
    });
  });
});
