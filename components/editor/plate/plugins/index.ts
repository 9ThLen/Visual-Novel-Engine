export const VN_PLATE_ELEMENT_TYPES = [
  'text',
  'dialogue',
  'choice',
  'technical',
] as const;

export type VNPlateElementType = typeof VN_PLATE_ELEMENT_TYPES[number];
