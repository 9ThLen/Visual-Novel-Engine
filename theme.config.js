/**
 * Theme Configuration — Visual Novel Engine
 *
 * Color system supports:
 * - Light/Dark mode via NativeWind
 * - Reader theme (warm beige/brown for reading comfort)
 * - Editor theme (dark indigo/purple for creative work)
 * - LEGO block colors for visual block identification
 *
 * All colors use OKLCH color space for perceptual uniformity.
 * Format: oklch(L% C H) where L=lightness, C=chroma, H=hue
 *
 * Design tokens follow Tailwind CSS naming convention.
 * All colors are defined as { light: string, dark: string } pairs.
 * NOTE: Keys use kebab-case, matching CSS custom property convention.
 */

const themeColors = require("./constants/theme-colors.json");

module.exports = { themeColors };
