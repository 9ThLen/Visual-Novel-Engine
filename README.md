# Visual Novel Engine 📖✨

A powerful, cross-platform visual novel engine built with React Native and Expo. Create, edit, and play interactive branching stories with rich media support, multilingual capabilities, and a beautiful beige-themed UI.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## 🌟 Key Features

### 📝 Professional Story Editor
- **Visual Node Editor** - Drag-and-drop interface for creating story graphs
- **Scene Editor** - Rich text editor with media integration
- **Branching Narratives** - Create complex choice-based storylines
- **Real-time Preview** - Test your story instantly
- **Auto-save** - Never lose your work
- **Media Library** - Organize images and audio files

### 🎮 Immersive Story Reader
- **Typewriter Effect** - Smooth text animation for dialogue
- **Character Sprites** - Display character images with positioning
- **Background Images** - Set the scene with custom backgrounds
- **Background Music** - Add atmosphere with audio tracks
- **Voice Acting** - Support for character voice lines
- **Choice System** - Player decisions that affect the story
- **Auto-play Mode** - Automatic dialogue progression
- **Responsive Layout** - Optimized for phones and tablets

### 💾 Advanced Save System
- **10 Manual Save Slots** - Multiple save files per story
- **Auto-save** - Automatic progress saving on scene changes
- **Rich Metadata** - Thumbnails, timestamps, scene info, play time
- **Quick Load** - Resume from any save point
- **Save Management** - Delete and organize saves
- **Preview Cards** - Visual save slot cards with scene thumbnails

### 🎨 Interactive Features
- **Clickable Objects** - Add interactive elements to scenes
- **Inventory System** - Collect and use items
- **Conditional Actions** - Objects that require specific items
- **Percentage-based Positioning** - Responsive object placement
- **Multiple Action Types:**
  - Show dialogue
  - Transition to scenes
  - Play audio
  - Add/remove items
  - Display images
  - Trigger custom events
- **5 Ready-to-use Templates** for common interactive objects

### 🎬 Splash Screens & Transitions
- **Image Splashes** - Display title cards and chapter screens
- **Video Splashes** - Play intro videos
- **Animated Backgrounds** - Dynamic scene transitions
- **4 Ready-to-use Templates:**
  - Dramatic Reveal (slow fade, 5s)
  - Quick Flash (fast transition, 1s)
  - Cinematic (medium pace, 3s)
  - Emotional Moment (gentle fade, 4s)
- **Customizable Timing** - Control fade in/out duration

### 🌍 Multilingual Support (i18n)
- **3 Languages Built-in:**
  - 🇬🇧 English
  - 🇺🇦 Ukrainian (Українська)
  - 🇷🇺 Russian (Русский)
- **80+ Translated UI Elements**
- **Language Selector** with flag icons
- **Persistent Language Preference**
- **Fallback Strategy** - Graceful handling of missing translations
- **Easy to Add More Languages** - JSON-based translation system

### 🎨 Beautiful UI/UX Design
- **Beige Color Palette** - Warm, comfortable reading experience
  - Light mode: Soft beige (#F5F1E8) with terracotta accents (#C17A5C)
  - Dark mode: Deep brown (#2A2318) with warm terracotta (#D89A7F)
- **Light & Dark Modes** - Automatic theme switching
- **Haptic Feedback** - Tactile response on all button interactions
- **Smooth Animations** - Polished transitions and effects
  - Button press: Scale animation (0.96x) with glow effect
  - Scene transitions: 380ms fade with slide
  - Modal appearances: Spring animation
- **Universal Button Component** - 5 variants (primary, secondary, outline, ghost, danger)
- **Responsive Design** - Works on all screen sizes
- **Accessibility** - WCAG AA compliant contrast ratios
- **Touch Targets** - Minimum 44x44 points for all interactive elements

### ❓ Interactive Help System
- **Help Mode** - Toggle with ? button to explain all UI elements
- **Contextual Tooltips** - Detailed explanations for every feature
- **Animated Highlighting** - Pulsing glow on interactive elements
- **Guided Tours** - Step-by-step walkthroughs:
  - Getting Started (4 steps)
  - Story Creation (3 steps)
  - Adding Media (3 steps)
- **First-time Guide** - Welcome tutorial for new users
- **5 Categories:**
  - 📖 Story - Story management and editing
  - 🎨 Media - Images, audio, and effects
  - 🧭 Navigation - App navigation and controls
  - ⚙️ Settings - Preferences and configuration
  - ⚡ Advanced - Interactive objects and splash screens
- **20+ Help Items** - Comprehensive coverage of all features

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

2. **Add Scenes**
   - Enter a story title
   - Tap "Create Story"
   - Edit the default scene or add new ones

3. **Add Media**
   - Tap background/audio buttons to add media
   - Use the media library for organization

4. **Create Choices**
   - Add choice buttons to create branching paths
   - Link choices to different scenes

5. **Preview Your Story**
   - Tap the preview button to test
   - Make adjustments as needed

### Using the Node Editor

The node editor provides a visual overview of your story structure:

- **Nodes** represent scenes
- **Lines** show connections between scenes
- **Drag** to rearrange nodes
- **Tap** to edit a scene
- **Connect** nodes to create story flow

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
    "ru": "Русский текст"
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
│   ├── editor.tsx           # Story list editor
│   ├── node-editor.tsx      # Visual graph editor
│   ├── scene-editor.tsx     # Scene detail editor
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
│   ├── story-context.tsx    # Story state management
│   ├── inventory-context.tsx # Inventory system
│   ├── i18n-context.tsx     # Internationalization
│   ├── help-system-context.tsx # Help system state
│   ├── help-system-types.ts # Help content database
│   ├── ui-feedback.ts       # Haptic & sound feedback
│   ├── types.ts             # TypeScript types
│   ├── splash-types.ts      # Splash screen types
│   ├── interactive-types.ts # Interactive object types
│   ├── translations.json    # UI translations
│   └── ...                  # Other utilities
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
| State Management | React Context API | - |
| Storage | AsyncStorage | 2.2 |
| Navigation | Expo Router | 6 |
| Animations | React Native Animated | - |
| Audio | expo-av | 16.0 |
| Images | expo-image | 3.0 |
| Haptics | expo-haptics | 15.0 |

## 📚 Documentation

- [Design System](./DESIGN_SYSTEM.md) - Color palette, typography, spacing
- [UI/UX Improvements](./UI_UX_IMPROVEMENTS.md) - Interaction patterns, animations
- [Help System](./HELP_SYSTEM.md) - Complete help system documentation
- [Build Readiness Report](./BUILD_READINESS_REPORT.md) - Pre-build checklist

## 🎯 Roadmap

### Completed Features ✅

- [x] Story editor with node graph
- [x] Save/load system with 10 slots
- [x] Interactive objects and inventory
- [x] Splash screens
- [x] Multilingual support (EN/UK/RU)
- [x] Beige UI theme with haptic feedback
- [x] Interactive help system
- [x] Guided tours
- [x] First-time user guide

### Planned Features 🔜

- [ ] Cloud sync for stories
- [ ] Story marketplace
- [ ] Advanced animation system
- [ ] Video backgrounds
- [ ] Mini-games integration
- [ ] Achievement system
- [ ] Statistics and analytics
- [ ] Export to web/desktop
- [ ] Collaborative editing
- [ ] Version control for stories

### Future Enhancements 💡

- [ ] More language support
- [ ] Custom theme creator
- [ ] Advanced audio mixing
- [ ] Particle effects
- [ ] 3D character models
- [ ] Live2D integration
- [ ] Voice recording in-app
- [ ] AI-assisted writing

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

*Last updated: April 13, 2026*
