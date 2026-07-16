/**
 * The showcase is a cinema, not a workspace: it stays dark whatever theme the
 * app is in, so posters and scene backdrops are the only source of colour.
 * Author-facing screens keep using useColors().
 */
export const SHOWCASE_COLORS = {
  bg: '#131320',
  card: '#1c1c2e',
  text: '#f2f1fb',
  secondary: '#b9b6d9',
  muted: '#8a87ad',
  accent: '#8b7cf6',
  scrim: '#05050c',
  border: '#2b2b42',
} as const;
