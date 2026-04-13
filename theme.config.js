/** @type {const} */
const themeColors = {
  // Primary - Warm Terracotta
  primary:    { light: '#C17A5C', dark: '#D89A7F' },

  // Backgrounds - Soft Beige / Deep Brown
  background: { light: '#F5F1E8', dark: '#2A2318' },
  surface:    { light: '#FFFFFF', dark: '#3D3226' },
  surfaceElevated: { light: '#FDFCF9', dark: '#4A3F32' },

  // Text
  foreground: { light: '#3D3226', dark: '#F5F1E8' },
  foregroundSecondary: { light: '#6B5D4F', dark: '#D4CFC3' },
  muted:      { light: '#9B8B7E', dark: '#9B8B7E' },

  // Borders
  border:     { light: '#E5DFD3', dark: '#4A3F32' },
  borderLight: { light: '#F0EBE0', dark: '#5A4D3E' },

  // Semantic Colors
  success:    { light: '#7FA66F', dark: '#8FB87F' },
  warning:    { light: '#D4A574', dark: '#E5B299' },
  error:      { light: '#C17A5C', dark: '#D89A7F' },
  info:       { light: '#8FA8B8', dark: '#9FB8C8' },

  // Interactive States
  hover:      { light: 'rgba(193, 122, 92, 0.08)', dark: 'rgba(216, 154, 127, 0.12)' },
  pressed:    { light: 'rgba(193, 122, 92, 0.16)', dark: 'rgba(216, 154, 127, 0.20)' },
  focus:      { light: 'rgba(193, 122, 92, 0.24)', dark: 'rgba(216, 154, 127, 0.28)' },

  // Overlays
  overlay:    { light: 'rgba(61, 50, 38, 0.6)', dark: 'rgba(42, 35, 24, 0.8)' },
  scrim:      { light: 'rgba(0, 0, 0, 0.32)', dark: 'rgba(0, 0, 0, 0.6)' },

  // VN-specific tokens
  dialogueBg: { light: 'rgba(253, 252, 249, 0.95)', dark: 'rgba(61, 50, 38, 0.95)' },
  nameBg:     { light: '#C17A5C', dark: '#D89A7F' },
  nameText:   { light: '#FFFFFF', dark: '#FFFFFF' },
  choiceBg:   { light: 'rgba(193, 122, 92, 0.08)', dark: 'rgba(216, 154, 127, 0.12)' },
  choiceBorder: { light: '#C17A5C', dark: '#D89A7F' },
};

module.exports = { themeColors };
