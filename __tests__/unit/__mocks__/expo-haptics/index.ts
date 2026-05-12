// Mock for expo-haptics
export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
};

export const SelectionFeedbackStyle = {
  Light: 'light',
};

export const Haptics = {
  impactAsync: vi.fn().mockResolvedValue(undefined),
  selectionAsync: vi.fn().mockResolvedValue(undefined),
};

export default Haptics;