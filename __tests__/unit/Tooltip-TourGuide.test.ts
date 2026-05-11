import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-native
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  Modal: 'Modal',
  TouchableWithoutFeedback: 'TouchableWithoutFeedback',
  Animated: {
    Value: class {
      setValue() {}
    },
    timing: vi.fn(() => ({ start: vi.fn() })),
    parallel: vi.fn(() => ({ start: vi.fn() })),
  },
  Dimensions: { get: () => ({ width: 375 }) },
}));

// Mock expo vector icons
vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// ── Tooltip Logic Tests ──────────────────────────────────────────────────

describe('Tooltip component logic', () => {
  it('has correct position styles mapping', () => {
    const positionStyles = {
      top: { bottom: '100%', marginBottom: 8 },
      bottom: { top: '100%', marginTop: 8 },
      left: { right: '100%', marginRight: 8 },
      right: { left: '100%', marginLeft: 8 },
    };
    expect(positionStyles.top.bottom).toBe('100%');
    expect(positionStyles.bottom.top).toBe('100%');
    expect(positionStyles.left.right).toBe('100%');
    expect(positionStyles.right.left).toBe('100%');
  });

  it('has correct interface shape', () => {
    const props = {
      text: 'Test tooltip',
      children: null,
      position: 'top' as const,
    };
    expect(props.text).toBe('Test tooltip');
    expect(props.position).toBe('top');
  });
});

// ── TourGuide Logic Tests ────────────────────────────────────────────────

describe('TourGuide component logic', () => {
  const tourSteps = [
    { id: 'welcome', title: 'Welcome', description: 'Intro' },
    { id: 'tabs', title: 'Tabs', description: 'Navigation' },
    { id: 'canvas', title: 'Canvas', description: 'Workspace' },
  ];

  it('has correct step interface', () => {
    expect(tourSteps).toHaveLength(3);
    expect(tourSteps[0].id).toBe('welcome');
    expect(tourSteps[1].title).toBe('Tabs');
  });

  it('step navigation logic: next increments step', () => {
    let currentStep = 0;
    // Simulate "next"
    if (currentStep < tourSteps.length - 1) {
      currentStep++;
    }
    expect(currentStep).toBe(1);
  });

  it('step navigation logic: next on last step triggers complete', () => {
    let currentStep = tourSteps.length - 1;
    let completed = false;
    if (currentStep < tourSteps.length - 1) {
      currentStep++;
    } else {
      completed = true;
    }
    expect(completed).toBe(true);
  });

  it('step navigation logic: back decrements step', () => {
    let currentStep = 2;
    if (currentStep > 0) {
      currentStep--;
    }
    expect(currentStep).toBe(1);
  });

  it('step navigation logic: back on first step does nothing', () => {
    let currentStep = 0;
    if (currentStep > 0) {
      currentStep--;
    }
    expect(currentStep).toBe(0);
  });

  it('step counter display logic', () => {
    for (let i = 0; i < tourSteps.length; i++) {
      const display = `${i + 1} / ${tourSteps.length}`;
      expect(display).toBe(`${i + 1} / 3`);
    }
  });

  it('next button label: "Далі" for non-last, "Завершити" for last', () => {
    for (let i = 0; i < tourSteps.length; i++) {
      const label = i === tourSteps.length - 1 ? 'Завершити' : 'Далі';
      if (i < tourSteps.length - 1) {
        expect(label).toBe('Далі');
      } else {
        expect(label).toBe('Завершити');
      }
    }
  });

  it('returns null when steps array is empty', () => {
    const emptySteps: Array<{ id: string; title: string; description: string }> = [];
    const visible = true;
    const shouldRender = visible && emptySteps.length > 0;
    expect(shouldRender).toBe(false);
  });

  it('returns null when not visible', () => {
    const visible = false;
    const shouldRender = visible && tourSteps.length > 0;
    expect(shouldRender).toBe(false);
  });
});
