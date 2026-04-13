# Design System - Visual Novel App

## Color Palette - Beige Theme

### Light Mode (Warm Beige)

```typescript
const lightColors = {
  // Primary - Warm Terracotta
  primary: '#C17A5C',
  primaryLight: '#D89A7F',
  primaryDark: '#A65D42',
  
  // Background - Soft Beige
  background: '#F5F1E8',
  surface: '#FFFFFF',
  surfaceElevated: '#FDFCF9',
  
  // Text
  foreground: '#3D3226',
  foregroundSecondary: '#6B5D4F',
  muted: '#9B8B7E',
  
  // Borders & Dividers
  border: '#E5DFD3',
  borderLight: '#F0EBE0',
  
  // Semantic Colors
  success: '#7FA66F',
  error: '#C17A5C',
  warning: '#D4A574',
  info: '#8FA8B8',
  
  // Interactive States
  hover: 'rgba(193, 122, 92, 0.08)',
  pressed: 'rgba(193, 122, 92, 0.16)',
  focus: 'rgba(193, 122, 92, 0.24)',
  
  // Overlays
  overlay: 'rgba(61, 50, 38, 0.6)',
  scrim: 'rgba(0, 0, 0, 0.32)',
  
  // Dialogue Box
  dialogueBg: 'rgba(253, 252, 249, 0.95)',
  nameBg: '#C17A5C',
  
  // Choice Buttons
  choiceBg: 'rgba(193, 122, 92, 0.08)',
  choiceBorder: '#C17A5C',
};
```

### Dark Mode (Deep Beige)

```typescript
const darkColors = {
  // Primary - Warm Terracotta
  primary: '#D89A7F',
  primaryLight: '#E5B299',
  primaryDark: '#C17A5C',
  
  // Background - Deep Brown
  background: '#2A2318',
  surface: '#3D3226',
  surfaceElevated: '#4A3F32',
  
  // Text
  foreground: '#F5F1E8',
  foregroundSecondary: '#D4CFC3',
  muted: '#9B8B7E',
  
  // Borders & Dividers
  border: '#4A3F32',
  borderLight: '#5A4D3E',
  
  // Semantic Colors
  success: '#8FB87F',
  error: '#D89A7F',
  warning: '#E5B299',
  info: '#9FB8C8',
  
  // Interactive States
  hover: 'rgba(216, 154, 127, 0.12)',
  pressed: 'rgba(216, 154, 127, 0.20)',
  focus: 'rgba(216, 154, 127, 0.28)',
  
  // Overlays
  overlay: 'rgba(42, 35, 24, 0.8)',
  scrim: 'rgba(0, 0, 0, 0.6)',
  
  // Dialogue Box
  dialogueBg: 'rgba(61, 50, 38, 0.95)',
  nameBg: '#D89A7F',
  
  // Choice Buttons
  choiceBg: 'rgba(216, 154, 127, 0.12)',
  choiceBorder: '#D89A7F',
};
```

## Typography

### Font Families

```typescript
const fonts = {
  // System fonts for best performance
  default: Platform.select({
    ios: 'System',
    android: 'Roboto',
    default: 'system-ui',
  }),
  
  // For dialogue text (more readable)
  dialogue: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Georgia, serif',
  }),
};
```

### Font Sizes

```typescript
const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 32,
  '4xl': 40,
};
```

### Font Weights

```typescript
const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};
```

### Line Heights

```typescript
const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.65,
  loose: 1.8,
};
```

## Spacing System

Based on 4px grid:

```typescript
const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
};
```

## Border Radius

```typescript
const borderRadius = {
  none: 0,
  sm: 6,
  base: 8,
  md: 10,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
};
```

## Shadows

```typescript
const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  base: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.20,
    shadowRadius: 24,
    elevation: 12,
  },
};
```

## Animation Timings

```typescript
const animation = {
  duration: {
    fast: 150,
    base: 250,
    slow: 350,
    slower: 500,
  },
  
  easing: {
    easeIn: Easing.in(Easing.ease),
    easeOut: Easing.out(Easing.ease),
    easeInOut: Easing.inOut(Easing.ease),
    spring: { tension: 50, friction: 8 },
  },
};
```

## Component Sizes

### Buttons

```typescript
const buttonSizes = {
  sm: {
    height: 36,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  base: {
    height: 44,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  lg: {
    height: 52,
    paddingHorizontal: 20,
    fontSize: 17,
  },
};
```

### Touch Targets

Minimum touch target: **44x44 points** (iOS HIG / Material Design)

## Interaction States

### Button States

1. **Default** - Base appearance
2. **Hover** - Subtle background tint (web/tablet)
3. **Pressed** - Darker background, scale 0.98
4. **Disabled** - 40% opacity, no interaction
5. **Loading** - Spinner, disabled state

### Feedback

- **Visual**: Color change, scale animation
- **Haptic**: Light impact on press
- **Audio**: Subtle click sound (optional)

## Accessibility

### Contrast Ratios

- Normal text: 4.5:1 minimum
- Large text (18pt+): 3:1 minimum
- UI components: 3:1 minimum

### Touch Targets

- Minimum: 44x44 points
- Recommended: 48x48 points
- Spacing between: 8 points minimum

## Layout Grid

### Margins

- Phone: 16px
- Tablet: 24px

### Gutters

- Between elements: 12px
- Between sections: 24px

## Responsive Breakpoints

```typescript
const breakpoints = {
  phone: 0,
  tablet: 768,
  desktop: 1024,
};
```

## Usage Examples

### Button

```tsx
<Button
  variant="primary"
  size="base"
  onPress={handlePress}
>
  Save Game
</Button>
```

### Card

```tsx
<Card
  elevation="base"
  padding={4}
  borderRadius="lg"
>
  <Text>Content</Text>
</Card>
```

### Typography

```tsx
<Text
  fontSize="lg"
  fontWeight="semibold"
  color="foreground"
>
  Heading
</Text>
```

## Design Principles

1. **Clarity** - Clear visual hierarchy
2. **Consistency** - Unified design language
3. **Feedback** - Immediate response to actions
4. **Efficiency** - Minimal steps to complete tasks
5. **Aesthetics** - Beautiful and calming
6. **Accessibility** - Usable by everyone

## Color Usage Guidelines

### Primary Color (Terracotta)
- Call-to-action buttons
- Active states
- Important highlights
- Links

### Background (Beige)
- Main app background
- Creates warm, comfortable atmosphere
- Reduces eye strain

### Surface (White/Dark)
- Cards and panels
- Elevated content
- Dialogue boxes

### Text
- High contrast for readability
- Hierarchy through weight and color
- Muted for secondary information

## Component Hierarchy

```
Screen
├── Header (navigation, title)
├── Content
│   ├── Cards
│   │   ├── Title
│   │   ├── Body
│   │   └── Actions
│   └── Lists
└── Footer (actions, navigation)
```

## Best Practices

### DO ✅
- Use consistent spacing
- Maintain touch target sizes
- Provide visual feedback
- Use semantic colors
- Test on real devices

### DON'T ❌
- Mix different design patterns
- Use tiny touch targets
- Ignore accessibility
- Overuse animations
- Forget loading states
