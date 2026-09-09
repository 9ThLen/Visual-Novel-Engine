/**
 * The showcase is a cinema, not a workspace: it stays dark whatever theme the
 * app is in, so posters and scene backdrops are the only source of colour.
 * Author-facing screens keep using useColors().
 *
 * These are NOT free-invented values — they are the app's own dark-scheme tokens
 * (constants/theme-colors.json, resolved via lib/_core/theme). Keeping them in
 * one const rather than calling useColors() is deliberate: most showcase styles
 * live in module-level StyleSheet.create, and the screen must not restyle when
 * an author flips the editor's theme. But the palette must MATCH the system's
 * warm sepia, so crossing "Showcase → Студія" never reads as a different app.
 * If a token below drifts from theme-colors.json dark, that is a bug to fix.
 */
export const SHOWCASE_COLORS = {
  bg: '#1C1916', // surface-container — the warmer of the two dark grounds; plain
  //                `background` (#171512) reads as neutral charcoal next to the posters
  card: '#2F2A24', // surface-1 (elevated warm brown)
  text: '#F3ECE4', // foreground
  secondary: '#C9BEB3', // foreground-secondary
  muted: '#A99D92', // foreground-tertiary
  primary: '#B0B08A', // primary (olive) — the app's call-to-action colour
  onPrimary: '#2B2A1F', // foreground-on-primary
  accent: '#D28D6B', // secondary (terracotta) — stars, chips, highlights
  scrim: '#0F0D0B', // solid warm near-black; alpha is appended at call sites
  border: '#4A433B', // border-subtle
} as const;
