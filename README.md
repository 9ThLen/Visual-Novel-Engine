# Visual Novel Engine

A cross-platform mobile visual novel engine built with React Native and Expo, featuring a complete branching narrative system, in-app content editor, and full save/load functionality. Create, edit, and play interactive visual novels on iOS, Android, and tablets.

## Features

### Story Engine & Reader

The core story engine supports a complete branching narrative system with full media integration. Players can read dialogue displayed across multiple pages, view background images and character sprites, and make meaningful choices that branch the story into different paths. The system automatically manages scene transitions and maintains playback state throughout the experience.

### Content Creation & Editing

The built-in editor allows non-technical users to create and modify visual novels directly on the device. Users can add new scenes, write dialogue text, upload background images and character sprites, attach voice audio and background music, and build branching choices by linking scenes together. All changes are saved locally and persist across app sessions.

### Audio System

Full audio support includes background music playback, voice audio for individual dialogue lines, and independent volume controls for each audio track. The audio system respects device settings (iOS silent mode) and provides seamless playback during scene transitions.

### Save & Load System

Players can save their progress to one of ten save slots, each with a timestamp and scene metadata. The save system captures the current scene, dialogue index, and all story state. Players can load any save slot to resume their progress, or delete saves to free up space.

### Settings & Preferences

Customizable user preferences include volume control for background music, voice, and sound effects; text display speed; text size selection; auto-play toggle; and dark mode support. All settings persist locally and apply immediately across the app.

### Responsive Design

The interface adapts to different screen sizes and orientations. Phone portrait mode displays the story in a standard vertical layout. Tablet portrait mode provides more screen space with larger text and buttons. Tablet landscape mode uses a split-screen layout with background on the left and dialogue on the right, optimizing the reading experience for wider screens.

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React Native | 0.81 |
| Build Tool | Expo | 54 |
| Language | TypeScript | 5.9 |
| Styling | NativeWind (Tailwind CSS) | 4 |
| State Management | React Context + useReducer | - |
| Storage | AsyncStorage | 2.2 |
| Navigation | Expo Router | 6 |

## Project Structure

```
visual-novel-engine/
├── app/                           # Screen components (Expo Router)
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab navigation
│   │   └── index.tsx             # Home screen
│   ├── reader.tsx                # Story reader screen
│   ├── editor.tsx                # Story editor screen
│   ├── scene-editor.tsx          # Scene editing screen
│   ├── settings.tsx              # User settings screen
│   └── save-load.tsx             # Save/load management screen
├── components/
│   ├── screen-container.tsx      # SafeArea wrapper
│   ├── story-reader.tsx          # Original story reader
│   ├── story-reader-responsive.tsx # Responsive reader
│   └── ui/
│       └── icon-symbol.tsx       # Icon mapping
├── lib/
│   ├── types.ts                  # TypeScript interfaces
│   ├── story-context.tsx         # Global state management
│   ├── story-context-enhanced.ts # Story editing functions
│   ├── audio-manager.ts          # Audio playback system
│   ├── responsive.ts             # Responsive utilities
│   └── utils.ts                  # Helper functions
├── hooks/
│   ├── use-colors.ts             # Theme colors hook
│   ├── use-color-scheme.ts       # Dark mode detection
│   └── use-auth.ts               # Authentication hook
├── assets/
│   ├── images/                   # App icons and splash
│   └── demo-story.json           # Example story
├── app.config.ts                 # Expo configuration
├── tailwind.config.js            # Tailwind theme
├── theme.config.js               # Color palette
└── package.json                  # Dependencies

```

## Getting Started

### Prerequisites

- Node.js 18+ and npm or pnpm
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator
- Expo Go app (for device testing)

### Installation

1. **Clone or extract the project:**

```bash
cd visual-novel-engine
```

2. **Install dependencies:**

```bash
pnpm install
```

3. **Start the development server:**

```bash
pnpm dev
```

The Metro bundler will start and display a QR code. You can now:

- **Web preview:** Open http://localhost:8081 in a browser
- **iOS Simulator:** Press `i` in the terminal
- **Android Emulator:** Press `a` in the terminal
- **Physical device:** Scan the QR code with Expo Go app

### Running on Physical Devices

**iOS (Expo Go):**

1. Install Expo Go from the App Store
2. Scan the QR code displayed by `pnpm dev`
3. The app will load in Expo Go

**Android (Expo Go):**

1. Install Expo Go from Google Play Store
2. Scan the QR code displayed by `pnpm dev`
3. The app will load in Expo Go

## Building APK for Android

### Build for Emulator/Testing

```bash
eas build --platform android --local
```

This builds an APK that runs on Android emulators and devices.

### Build for Production

```bash
eas build --platform android
```

This creates a production-ready APK optimized for app store distribution.

### Manual APK Build (Local)

If you prefer to build locally without EAS:

```bash
# Build the APK
expo build:android

# Or use the newer Expo CLI
eas build --platform android --local
```

The APK will be generated in the `dist/` directory. You can then:

1. Transfer the APK to your Android device
2. Enable "Unknown Sources" in device settings
3. Open the APK file to install

## Using the Demo Story

The app includes a demo story called "The Forgotten Library" with 15 branching scenes. When you first launch the app, the demo story is automatically loaded. You can:

- **Play the demo:** Tap "Play" on the home screen to read the story
- **Edit the demo:** Tap "Edit" to modify scenes, add choices, or change dialogue
- **Create new stories:** Tap "New Story" in the editor to start from scratch

## Creating Your Own Story

### Step 1: Create a Story

1. Open the app and navigate to the Editor tab
2. Tap "New Story" and enter a title
3. The editor will create a new story with one starting scene

### Step 2: Edit Scenes

1. Tap "Edit" on your story to open the scene editor
2. Modify the scene text (dialogue)
3. Add background image URI (URL or local path)
4. Add voice audio URI (URL or local path)
5. Add background music URI (URL or local path)
6. Tap "Save Scene"

### Step 3: Add Choices

1. In the scene editor, scroll to the "Choices" section
2. Enter choice text (e.g., "Go left")
3. Select a target scene from the list
4. Tap "Add Choice"
5. Repeat for multiple branches

### Step 4: Create New Scenes

1. In the scene editor, scroll to "All Scenes"
2. Tap "+ Add New Scene"
3. A new scene ID will be generated
4. Edit the new scene as described in Step 2
5. Link other scenes to this new scene via choices

### Step 5: Preview Your Story

1. Tap "Preview Story" to play through your story in the reader
2. Test all choices and scene transitions
3. Return to the editor to make adjustments

## Data Structure

### Story JSON Format

Each story is stored as JSON with the following structure:

```json
{
  "id": "story-1234567890",
  "title": "My Story",
  "description": "A branching visual novel",
  "author": "Author Name",
  "startSceneId": "scene_1",
  "scenes": {
    "scene_1": {
      "id": "scene_1",
      "text": "Once upon a time...",
      "backgroundImageUri": "https://example.com/bg.jpg",
      "characters": [
        {
          "id": "char_1",
          "name": "Alice",
          "imageUri": "https://example.com/alice.png",
          "position": "left"
        }
      ],
      "voiceAudioUri": "https://example.com/voice.mp3",
      "musicUri": "https://example.com/music.mp3",
      "choices": [
        {
          "id": "choice_1",
          "text": "Go left",
          "nextSceneId": "scene_2"
        },
        {
          "id": "choice_2",
          "text": "Go right",
          "nextSceneId": "scene_3"
        }
      ]
    }
  },
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

### Save Slot Format

Save slots store the current playback state:

```json
{
  "id": "slot-1",
  "storyId": "story-1234567890",
  "sceneId": "scene_5",
  "sceneName": "The Library",
  "dialogueIndex": 2,
  "timestamp": 1234567890
}
```

## Customization

### Theme Colors

Edit `theme.config.js` to customize the app's color scheme:

```javascript
const themeColors = {
  primary: { light: '#0a7ea4', dark: '#0a7ea4' },
  background: { light: '#ffffff', dark: '#151718' },
  surface: { light: '#f5f5f5', dark: '#1e2022' },
  foreground: { light: '#11181C', dark: '#ECEDEE' },
  // ... more colors
};
```

### App Branding

Update `app.config.ts` to change the app name, icon, and splash screen:

```typescript
const env = {
  appName: "Your App Name",
  appSlug: "your-app-slug",
  logoUrl: "https://s3.example.com/logo.png",
};
```

### Font Sizes & Spacing

Responsive utilities in `lib/responsive.ts` automatically adjust font sizes and spacing based on device type. Modify the functions to customize breakpoints:

```typescript
export const getResponsiveFontSize = () => {
  const { isTablet } = getResponsiveValues();
  return {
    xs: isTablet ? 13 : 11,
    sm: isTablet ? 14 : 12,
    // ... more sizes
  };
};
```

## Troubleshooting

### App Won't Start

**Issue:** Metro bundler fails to start or shows compilation errors.

**Solution:** Clear the cache and reinstall dependencies:

```bash
rm -rf node_modules .expo
pnpm install
pnpm dev
```

### Audio Not Playing

**Issue:** Audio files don't play or produce errors.

**Solution:** Ensure audio URIs are valid URLs or local file paths. Test with a known working audio file first. Check device volume settings and ensure the app has audio permissions.

### Save/Load Not Working

**Issue:** Saves don't persist or load fails.

**Solution:** Check that AsyncStorage is properly initialized. Clear app cache and data, then try again. Ensure sufficient device storage is available.

### Responsive Layout Issues

**Issue:** UI doesn't adapt correctly on tablets or landscape mode.

**Solution:** Verify that `Dimensions.get('window')` returns correct values. Test on actual devices, as emulators may report incorrect dimensions. Check that responsive utilities are imported and used in all screens.

### Performance Issues on Low-End Devices

**Issue:** App lags or stutters during scene transitions.

**Solution:** Reduce image resolution and use compression. Limit the number of simultaneous animations. Use `FlatList` instead of `ScrollView` for long lists. Profile the app using React DevTools to identify bottlenecks.

## API Reference

### Story Context Hooks

**useStory()** — Access global story state and functions:

```typescript
const {
  stories,              // Array of all stories
  currentStory,         // Currently loaded story
  playbackState,        // Current playback state
  settings,             // User settings
  saveSlots,            // Array of save slots
  addStory,             // Create new story
  deleteStory,          // Delete story
  setCurrentStory,      // Load story
  updatePlaybackState,  // Update playback
  saveGame,             // Save to slot
  loadGame,             // Load from slot
  deleteGame,           // Delete save
  updateSettings,       // Update preferences
} = useStory();
```

### Audio Manager

**audioManager** — Control audio playback:

```typescript
import { audioManager } from '@/lib/audio-manager';

await audioManager.initialize();
await audioManager.playAudio('bgm', 'https://example.com/music.mp3', 0.8, true);
await audioManager.setVolume('bgm', 0.5);
await audioManager.pauseAudio('bgm');
await audioManager.stopAll();
```

### Responsive Utilities

**getResponsiveValues()** — Get device information:

```typescript
import { getResponsiveValues } from '@/lib/responsive';

const { width, height, isTablet, isLandscape, isWeb } = getResponsiveValues();
```

**getReaderLayout()** — Get optimized reader layout:

```typescript
import { getReaderLayout } from '@/lib/responsive';

const {
  backgroundHeight,
  backgroundWidth,
  dialogueHeight,
  dialogueWidth,
  dialoguePosition,
} = getReaderLayout();
```

## Performance Optimization

The app is optimized for low-end devices with the following strategies:

- **Image caching:** Background images are cached after first load
- **Lazy loading:** Character sprites load only when needed
- **Memory management:** Audio tracks are unloaded after playback
- **List optimization:** FlatList used for scene and choice lists
- **Animation performance:** Transitions use 300ms duration with timing curves
- **Code splitting:** Screens load on-demand via Expo Router

## Known Limitations

- Audio playback via URIs requires network access or pre-downloaded files
- Character sprite positioning is limited to left/center/right
- Maximum of 10 save slots (configurable in code)
- Story export/import uses JSON format only
- No cloud sync or cross-device save support (local storage only)

## Future Enhancements

Potential features for future versions include cloud save synchronization, advanced animation system, particle effects, video playback, multiplayer branching, and community story sharing.

## License

This project is provided as-is for educational and personal use.

## Support

For issues, questions, or feature requests, please refer to the troubleshooting section above or check the project documentation.

---

**Built with React Native, Expo, and TypeScript**

Version 1.0.0 | Last Updated: March 2026
