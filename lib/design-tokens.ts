export const typeScale = {
  pageTitle: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 27, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;
