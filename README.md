# Visual Novel Engine

Кросплатформовий конструктор візуальних новел на базі Expo, React Native і Zustand. Поточний milestone зосереджений на стабільному editor/runtime циклі: canonical `SceneRecord + TimelineStep`, узгоджених save/load flows, StoryFlow і reader без implicit legacy розсинхрону.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## Current Architecture

- **Canonical scene contract** — `SceneRecord + TimelineStep` є єдиним steady-state contract для editor, preview, reader і StoryFlow
- **State management** — app state живе в `useAppStore`, editor draft у `useEditorStore`; нові production flows не покладаються на React Context як на source of truth
- **Runtime reconstruction** — preview, reader, autosave і manual save/load працюють через centralized runtime helpers
- **Story flow** — graph nodes, positions, start-scene state і connections походять з canonical scene records
- **Compatibility boundary** — `Story` / `StoryScene` лишаються лише для explicit import/export або migration scenarios

## Main User Flow

1. Відкрити Home і перейти в `editor.tsx`
2. Створити історію або відкрити існуючу
3. Редагувати сцену через `scene-editor.tsx` і `SceneComposer`
4. Перевірити структуру через `scene-manager` і `story-flow`
5. Запустити preview / `play` / `reader`
6. Використати autosave або manual save/load на тому ж canonical data path

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
# Clone the repository
git clone https://github.com/9ThLen/Visual-Novel-Engine.git
cd visual-novel-engine

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Running on Different Platforms

```bash
# Web
pnpm dev:metro

# iOS
pnpm ios

# Android
pnpm android
```

### Adding Sound Files (Optional)

The app supports UI sound effects but works perfectly without them (graceful degradation).

To add sounds:

1. Download free sound files from:
   - [Freesound.org](https://freesound.org/) (CC0 license)
   - [Zapsplat](https://www.zapsplat.com/)
   - [Mixkit](https://mixkit.co/free-sound-effects/)

2. Place these files in `assets/sounds/`:
   - `click.mp3` - Button press (50-100ms)
   - `success.mp3` - Success action (200-400ms)
   - `error.mp3` - Error/warning (200-400ms)
   - `whoosh.mp3` - Transitions (300-500ms)

3. Rebuild the app

See `assets/sounds/README.md` for detailed instructions.

## 📱 Building for Production

### Using EAS Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Build for Android
eas build --platform android --profile production

# Build for iOS
eas build --platform ios --profile production

# Build for both
eas build --platform all --profile production
```

### Local Build

```bash
# Build server bundle
pnpm build

# Start production server
pnpm start
```

## 📖 Usage Guide

### Creating Your First Story

1. **Open the Editor**
   - Tap the "Edit" button on the home screen
   - Tap "+ New" to create a story

2. **Create the Initial Canonical Story**
   - Enter a story title
   - Tap "Create Story"
   - The app creates story metadata plus a persisted start scene in canonical form

3. **Add Media**
   - Tap background/audio buttons to add media
   - Use the media library for organization

4. **Create Choices**
   - Add choice buttons to create branching paths
   - Link choices to different scenes

5. **Preview and Play**
   - Use Preview for scene-level validation
   - Use Story Flow for graph-level edits
   - Use Play/Reader to test the runtime path

### Managing Story Flow

`StoryFlowScreen` provides the visual overview of your story structure:

- **Nodes** represent canonical scene records
- **Lines** represent persisted scene connections
- **Drag** updates persisted `flowX/flowY`
- **Set Start** synchronizes start-scene metadata and runtime entry
- **Play** tests the same graph the runtime uses

### Adding Interactive Objects

1. Open the scene editor
2. Tap "Interactive Objects"
3. Add objects with positions (percentage-based)
4. Configure actions (dialogue, scene change, etc.)
5. Set requirements (items needed to interact)
6. Enable pulse animation for visibility

### Implementing Splash Screens

```typescript
// In your scene configuration
splashScreen: {
  type: 'image',
  uri: 'path/to/image.png',
  duration: 3000,
  fadeIn: 500,
  fadeOut: 500,
  showBefore: true
}
```

### Adding Translations

Edit `lib/translations.json`:

```json
{
  "your.key": {
    "en": "English text",
    "uk": "Український текст",
    "ru": "Русский текст",
    "pl": "Polski tekst"
  }
}
```

### Using the Help System

1. **Toggle Help Mode** - Tap the ? button in the editor
2. **Click Any Element** - See its explanation
3. **Start a Guided Tour** - Follow step-by-step instructions
4. **First-time Users** - Automatic welcome guide

## 🎨 Customization

### Changing the Color Theme

Edit `theme.config.js`:

```javascript
const themeColors = {
  primary: { light: '#C17A5C', dark: '#D89A7F' },
  background: { light: '#F5F1E8', dark: '#2A2318' },
  surface: { light: '#FFFFFF', dark: '#3D3226' },
  // ... more colors
};
```

### Adding Custom Fonts

1. Add font files to `assets/fonts/`
2. Update `app.json`:

```json
{
  "expo": {
    "fonts": {
      "custom-font": "./assets/fonts/CustomFont.ttf"
    }
  }
}
```

### Creating Custom Help Items

Add to `lib/help-system-types.ts`:

```typescript
export const HELP_CONTENT: Record<string, HelpItem> = {
  my_feature: {
    id: 'my_feature',
    label: 'My Feature',
    description: 'This feature does something amazing',
    hint: 'Try clicking it multiple times',
    category: 'story',
    keywords: ['feature', 'button', 'action'],
  },
};
```

### Using HelpableElement

Wrap any component to make it explainable:

```tsx
import { HelpableElement } from '@/components/HelpableElement';

<HelpableElement
  helpId="my_feature"
  onPress={handleAction}
>
  <Button>My Feature</Button>
</HelpableElement>
```

## 📁 Project Structure

```
visual-novel-engine/
├── app/                      # Expo Router screens
│   ├── (tabs)/              # Tab navigation
│   │   └── index.tsx        # Home screen
│   ├── editor.tsx           # Story list and creation entry point
│   ├── scene-editor.tsx     # Canonical scene editor route
│   ├── scene-manager.tsx    # Scene list / CRUD route
│   ├── story-flow.tsx       # Story graph route
│   ├── reader.tsx           # Story reader
│   ├── settings.tsx         # Settings screen
│   └── save-load.tsx        # Save/Load screen
├── components/              # React components
│   ├── ui/                  # UI components
│   │   └── Button.tsx       # Universal button
│   ├── HelpableElement.tsx  # Help system wrapper
│   ├── HelpTooltip.tsx      # Contextual tooltips
│   ├── GuidedTourOverlay.tsx # Guided tours
│   ├── FirstTimeGuide.tsx   # Welcome modal
│   ├── HelpModeToggle.tsx   # Help mode button
│   ├── StoryReader.tsx      # Reader component
│   ├── SplashScreen.tsx     # Splash screen display
│   ├── InteractiveObjectsLayer.tsx # Interactive objects
│   ├── InventoryUI.tsx      # Inventory modal
│   └── LanguageSelector.tsx # Language picker
├── lib/                     # Core logic
│   ├── runtime-story.ts     # Canonical runtime reconstruction
│   ├── canonical-scene.ts   # Canonical scene selectors/helpers
│   ├── scene-operations.ts  # Scene CRUD/start-scene invariants
│   ├── story-flow-graph.ts  # Derived graph helpers for StoryFlow
│   ├── types.ts             # Legacy compatibility types
│   └── ...                  # Other utilities
├── stores/
│   ├── use-app-store.ts     # Main app state
│   └── use-editor-store.ts  # Scene draft state
├── assets/                  # Static assets
│   ├── demo-story.json      # Example story
│   └── ...                  # Images, fonts, etc.
├── app.json                 # Expo configuration
├── theme.config.js          # Color palette
├── package.json             # Dependencies
├── DESIGN_SYSTEM.md         # Design documentation
├── UI_UX_IMPROVEMENTS.md    # UI/UX guide
├── HELP_SYSTEM.md           # Help system docs
├── BUILD_READINESS_REPORT.md # Build checklist
└── README.md               # This file
```

## 🛠️ Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React Native | 0.81 |
| Build Tool | Expo | 54 |
| Language | TypeScript | 5.9 |
| Styling | NativeWind (Tailwind CSS) | 4 |
| State Management | Zustand | 5.x |
| Storage | AsyncStorage | 2.2 |
| Navigation | Expo Router | 6 |
|| Animations | react-native-reanimated | 4.1 |
| Audio | expo-av | 16.0 |
| Images | expo-image | 3.0 |
| Haptics | expo-haptics | 15.0 |

## 📚 Documentation

- [[Wiki Index|wiki/index]] — Full project documentation (Obsidian vault)
- [[Design System|wiki/design-system-update-2026-05-18]] — OKLCH color system, elevation, accessibility
- [docs/SCENE-MODEL-CONTRACT.md](file:///d:/Programs/D/visual_novel_engine/docs/SCENE-MODEL-CONTRACT.md) — Canonical scene contract
- [[Architecture Reference|wiki/architecture-reference]] — Current architecture reference
- [[Tasks Backlog|wiki/tasks-backlog]] — 41 tasks, ~200-300 hours remaining

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Add TypeScript types for all new code
- Write meaningful commit messages
- Test on multiple platforms
- Update documentation as needed
- Add help items for new features

## 🐛 Bug Reports

Found a bug? Please open an issue with:

- Description of the bug
- Steps to reproduce
- Expected behavior
- Screenshots (if applicable)
- Platform and version info


## 🙏 Acknowledgments

- Expo team for the amazing framework
- React Native community
- All contributors and testers
- Visual novel community for inspiration

## 📞 Support

- **Documentation:** [GitHub Wiki](https://github.com/9ThLen/Visual-Novel-Engine)

## 🌟 Show Your Support

If you like this project, please give it a ⭐ on GitHub!

---

**Made with ❤️

*Last updated: April 14, 2026*
