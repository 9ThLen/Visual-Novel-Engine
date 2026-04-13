# Help System Documentation

## Overview

A professional contextual help system for the visual novel editor with animated highlighting, guided tours, and first-time user onboarding.

## Architecture

### Core Components

```
lib/
├── help-system-types.ts      # Type definitions and help content database
├── help-system-context.tsx   # State management and persistence

components/
├── HelpableElement.tsx        # Wrapper for interactive elements
├── HelpTooltip.tsx           # Contextual tooltip display
├── GuidedTourOverlay.tsx     # Sequential guided tours
├── FirstTimeGuide.tsx        # Welcome modal for new users
└── HelpModeToggle.tsx        # Toggle button for help mode
```

## Features

### 1. Help Mode

- **Toggle**: Question mark (?) button in editor
- **Behavior**: When active, all interactive elements become "explainable"
- **Visual Feedback**: 
  - Highlighted borders (terracotta color)
  - Soft glow effect
  - Pulsing animation for guided tour steps
- **Interaction**: Click any element to see its explanation

### 2. Contextual Tooltips

Each tooltip displays:
- **Category Badge**: Icon and color-coded category
- **Label**: Element name
- **Description**: Clear explanation of function
- **Hint**: Optional usage tip (with 💡 icon)
- **Close Button**: "Got it" button

**Categories**:
- 📖 Story (terracotta)
- 🎨 Media (green)
- 🧭 Navigation (blue)
- ⚙️ Settings (gray)
- ⚡ Advanced (orange)

### 3. Guided Tours

**Sequential step-by-step tutorials**:
- Progress bar showing completion
- Step counter (e.g., "Step 2 of 5")
- Title and message for each step
- Navigation: Back, Next, Skip Tour
- Spotlight highlighting on current element
- Auto-advances through key features

**Available Tours**:
- `firstTime`: Getting Started (4 steps)
- `storyBasics`: Story Creation (3 steps)
- `mediaGuide`: Adding Media (3 steps)

### 4. First-Time User Guide

- **Auto-triggers**: On first editor launch
- **Welcome Modal**: Friendly introduction
- **Features Preview**: 3 key features highlighted
- **Options**: Start Tour or Skip
- **Persistent**: Never shows again after dismissal

### 5. Animated Highlighting

- **Pulse Animation**: 1.0 → 1.08 → 1.0 scale (1s cycle)
- **Glow Effect**: Soft shadow with primary color
- **Border**: 2px solid terracotta
- **Background Tint**: Subtle primary color overlay

## Usage

### Basic Implementation

#### 1. Wrap Interactive Elements

```tsx
import { HelpableElement } from '@/components/HelpableElement';

<HelpableElement
  helpId="add_scene_button"
  onPress={handleAddScene}
>
  <Button>Add Scene</Button>
</HelpableElement>
```

#### 2. Add Help System UI

```tsx
import { HelpTooltip } from '@/components/HelpTooltip';
import { GuidedTourOverlay } from '@/components/GuidedTourOverlay';
import { FirstTimeGuide } from '@/components/FirstTimeGuide';
import { HelpModeToggle } from '@/components/HelpModeToggle';

function EditorScreen() {
  return (
    <View>
      {/* Help System Components */}
      <HelpTooltip />
      <GuidedTourOverlay />
      <FirstTimeGuide />
      
      {/* Help Mode Toggle */}
      <HelpModeToggle />
      
      {/* Your UI */}
    </View>
  );
}
```

#### 3. Use Help System Context

```tsx
import { useHelpSystem } from '@/lib/help-system-context';

function MyComponent() {
  const {
    isHelpModeActive,
    toggleHelpMode,
    startGuidedTour,
  } = useHelpSystem();

  return (
    <Button onPress={() => startGuidedTour('firstTime')}>
      Start Tutorial
    </Button>
  );
}
```

## Adding New Help Content

### 1. Define Help Item

Edit `lib/help-system-types.ts`:

```typescript
export const HELP_CONTENT: Record<string, HelpItem> = {
  my_new_button: {
    id: 'my_new_button',
    label: 'My Feature',
    description: 'This button does something amazing',
    hint: 'Try clicking it multiple times',
    category: 'story',
    keywords: ['feature', 'button', 'action'],
  },
  // ... other items
};
```

### 2. Wrap UI Element

```tsx
<HelpableElement
  helpId="my_new_button"
  onPress={handleMyAction}
>
  <Button>My Feature</Button>
</HelpableElement>
```

### 3. Add to Guided Tour (Optional)

```typescript
export const GUIDED_TOURS: Record<string, GuidedTour> = {
  myTour: {
    id: 'my_tour',
    name: 'My Feature Tour',
    description: 'Learn about my new feature',
    category: 'story',
    steps: [
      {
        helpItemId: 'my_new_button',
        order: 0,
        title: 'New Feature!',
        message: 'This is how you use the new feature.',
      },
    ],
  },
};
```

## API Reference

### HelpSystemContext

```typescript
interface HelpSystemContextValue {
  // State
  isHelpModeActive: boolean;
  activeTooltip: string | null;
  isGuidedTourActive: boolean;
  currentTourStep: number;
  hasSeenFirstTimeGuide: boolean;

  // Actions
  toggleHelpMode: () => void;
  showTooltip: (helpItemId: string, position: HelpTooltipPosition) => void;
  hideTooltip: () => void;
  startGuidedTour: (tourId: string) => void;
  nextTourStep: () => void;
  previousTourStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  markFirstTimeGuideSeen: () => void;
  getCurrentTour: () => GuidedTour | null;
}
```

### HelpableElement Props

```typescript
interface HelpableElementProps {
  helpId: string;              // ID from HELP_CONTENT
  children: React.ReactNode;   // UI element to wrap
  disabled?: boolean;          // Disable normal interaction
  onPress?: () => void;        // Normal action handler
  style?: any;                 // Additional styles
}
```

### HelpItem Structure

```typescript
interface HelpItem {
  id: string;                  // Unique identifier
  label: string;               // Display name
  description: string;         // Clear explanation
  hint?: string;               // Optional usage tip
  category: HelpCategory;      // story | media | navigation | settings | advanced
  keywords?: string[];         // For future search feature
}
```

### GuidedTour Structure

```typescript
interface GuidedTour {
  id: string;                  // Unique identifier
  name: string;                // Tour name
  description: string;         // Tour description
  steps: GuidedTourStep[];     // Sequential steps
  category: HelpCategory;      // Tour category
}

interface GuidedTourStep {
  helpItemId: string;          // Element to highlight
  order: number;               // Step sequence
  title: string;               // Step title
  message: string;             // Step explanation
  highlightDuration?: number;  // Optional custom duration
}
```

## Behavior Details

### Help Mode ON

1. All `HelpableElement` components get highlighted
2. Normal actions are disabled
3. Clicking any element shows its tooltip
4. Help toggle button pulses continuously
5. Background overlay dims the screen slightly

### Help Mode OFF

1. Elements behave normally
2. No highlighting or tooltips
3. Standard interactions work
4. Help toggle button is static

### During Guided Tour

1. Help mode is automatically enabled
2. Only current step element is highlighted
3. Current element pulses with animation
4. Tour overlay shows at bottom of screen
5. Help toggle button is hidden
6. Progress bar shows completion percentage

## Styling

### Colors (from theme)

```typescript
Primary: #C17A5C (light) / #D89A7F (dark)
Background: #F5F1E8 (light) / #2A2318 (dark)
Surface: #FFFFFF (light) / #3D3226 (dark)
```

### Animations

```typescript
Pulse: 1000ms loop (1.0 → 1.08 → 1.0)
Tooltip Fade: 200ms
Tooltip Scale: Spring (tension: 100, friction: 8)
Button Rotate: 200ms on toggle
```

### Dimensions

```typescript
Help Toggle: 44x44 (minimum touch target)
Tooltip Width: 280px
Tooltip Max Height: 160px
Border Width: 2px
Shadow Radius: 8px
```

## Persistence

Stored in AsyncStorage:
- `hasSeenFirstTimeGuide`: boolean

Session-only (not persisted):
- Help mode state
- Active tooltip
- Current tour progress

## Best Practices

### DO ✅

- Use clear, concise descriptions (1-2 sentences)
- Add hints for non-obvious features
- Group related features in tours
- Test on real devices for touch targets
- Keep tour steps under 5 per tour
- Use appropriate categories
- Provide keywords for future search

### DON'T ❌

- Write long explanations (keep under 100 words)
- Nest HelpableElements inside each other
- Forget to add help for new features
- Use technical jargon in descriptions
- Create tours longer than 7 steps
- Skip the hint field for complex features
- Hardcode help text in components

## Extending the System

### Add New Category

1. Update `HelpCategory` type
2. Add to `HELP_CATEGORIES` with icon and color
3. Create help items with new category
4. Update documentation

### Add Search Feature

```typescript
// Future enhancement
function searchHelp(query: string): HelpItem[] {
  return Object.values(HELP_CONTENT).filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.description.toLowerCase().includes(query.toLowerCase()) ||
    item.keywords?.some(k => k.includes(query.toLowerCase()))
  );
}
```

### Add Video Tutorials

```typescript
// Future enhancement
interface HelpItem {
  // ... existing fields
  videoUri?: string;
  videoDuration?: number;
}
```

### Add Contextual Tips

```typescript
// Future enhancement
interface ContextualTip {
  id: string;
  trigger: 'idle' | 'error' | 'success';
  condition: () => boolean;
  message: string;
}
```

## Troubleshooting

### Tooltip Not Showing

- Check `helpId` matches entry in `HELP_CONTENT`
- Verify `HelpTooltip` component is rendered
- Ensure help mode is active

### Element Not Highlighting

- Confirm element is wrapped in `HelpableElement`
- Check if guided tour is active (only current step highlights)
- Verify help mode is enabled

### Tour Not Starting

- Check tour ID exists in `GUIDED_TOURS`
- Ensure all `helpItemId` references exist in `HELP_CONTENT`
- Verify `GuidedTourOverlay` is rendered

### First-Time Guide Not Showing

- Check if already seen (stored in AsyncStorage)
- Clear app data to reset
- Verify `FirstTimeGuide` component is rendered

## Performance

- **Lazy Loading**: Help content loaded on demand
- **Memoization**: Tour steps cached during active tour
- **Native Driver**: All animations use native driver
- **Minimal Re-renders**: Context optimized with proper dependencies

## Accessibility

- **Touch Targets**: All interactive elements 44x44 minimum
- **Contrast**: WCAG AA compliant text contrast
- **Screen Readers**: Semantic labels for all elements
- **Keyboard Navigation**: Full keyboard support (web)

## Future Enhancements

- [ ] Search help content by keyword
- [ ] Video tutorial integration
- [ ] Contextual tips based on user behavior
- [ ] Multi-language support for help text
- [ ] Analytics tracking for help usage
- [ ] Export/import custom help content
- [ ] Community-contributed tutorials
- [ ] Voice-guided tours

## Example: Complete Feature Implementation

```tsx
// 1. Add help content
export const HELP_CONTENT = {
  export_story: {
    id: 'export_story',
    label: 'Export Story',
    description: 'Export your story as a shareable file',
    hint: 'Exported files can be imported by other users',
    category: 'advanced',
    keywords: ['export', 'share', 'file'],
  },
};

// 2. Implement UI
function ExportButton() {
  const handleExport = () => {
    // Export logic
  };

  return (
    <HelpableElement
      helpId="export_story"
      onPress={handleExport}
    >
      <Button variant="secondary">
        📤 Export
      </Button>
    </HelpableElement>
  );
}

// 3. Add to tour (optional)
export const GUIDED_TOURS = {
  advanced: {
    id: 'advanced_features',
    name: 'Advanced Features',
    description: 'Learn about advanced editor features',
    category: 'advanced',
    steps: [
      {
        helpItemId: 'export_story',
        order: 0,
        title: 'Share Your Work',
        message: 'Export your story to share with others.',
      },
    ],
  },
};
```

## Conclusion

The help system provides a scalable, professional solution for contextual help in the visual novel editor. It's designed to be:

- **User-Friendly**: Clear, visual, and interactive
- **Developer-Friendly**: Easy to extend and maintain
- **Performance-Optimized**: Smooth animations and minimal overhead
- **Accessible**: Works for all users
- **Scalable**: Grows with your feature set

Ready to help users create amazing visual novels! 📖✨
