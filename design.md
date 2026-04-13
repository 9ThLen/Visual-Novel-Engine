# Visual Novel Engine - Design Document

## Overview
A mobile visual novel reader and editor designed for portrait orientation (9:16) with one-handed usage in mind. The app allows users to read branching stories with full media support (backgrounds, character sprites, voice acting) and edit stories through an intuitive in-app editor.

---

## Screen List

### 1. **Home Screen**
- **Purpose**: Main entry point; shows story selection and quick actions
- **Content**:
  - Story list (cards showing title, thumbnail, last played)
  - "New Story" button
  - "Settings" button (top-right)
  - "Editor" button (quick access to content editor)

### 2. **Story Reader Screen**
- **Purpose**: Main reading experience; displays the visual novel
- **Content**:
  - Full-screen background image (top 60%)
  - Character sprite(s) layered over background
  - Dialogue text box (bottom 40%)
  - Tap-to-continue indicator
  - Voice audio plays automatically or on-demand
  - Choice buttons appear when branching options exist

### 3. **Choice Screen**
- **Purpose**: Display branching options
- **Content**:
  - Story context (background + character still visible)
  - Multiple choice buttons (vertically stacked)
  - Each choice shows preview text
  - Selection triggers transition to next scene

### 4. **Settings Screen**
- **Purpose**: Configure playback and UI preferences
- **Content**:
  - Volume sliders (BGM, Voice, SFX)
  - Text speed slider (slow → fast)
  - Auto-play toggle (auto-advance after voice ends)
  - Text size selector (small, medium, large)
  - Dark mode toggle
  - Reset save data button

### 5. **Save/Load Screen**
- **Purpose**: Manage story progress
- **Content**:
  - Save slots (5-10 slots visible)
  - Each slot shows: timestamp, scene name, thumbnail
  - Buttons: Save, Load, Delete
  - Quick save/load shortcuts

### 6. **Editor Home Screen**
- **Purpose**: Entry point for content editing
- **Content**:
  - Story list (editable stories)
  - "Create New Story" button
  - "Import Story" button
  - "Export Story" button
  - Edit/Delete buttons per story

### 7. **Scene Editor Screen**
- **Purpose**: Create/edit individual scenes
- **Content**:
  - Scene ID input field
  - Background image picker
  - Character sprite picker (add/remove multiple)
  - Dialogue text input (large text area)
  - Voice audio picker
  - Choice builder (add/edit/delete branching options)
  - Preview button (test scene in reader)
  - Save button

### 8. **Choice Editor Screen**
- **Purpose**: Configure branching options
- **Content**:
  - Choice text input
  - Target scene selector (dropdown of existing scenes)
  - Add/Delete buttons
  - Visual tree preview (optional)

### 9. **Asset Manager Screen**
- **Purpose**: Manage uploaded images and audio
- **Content**:
  - Tabs: Images | Audio
  - Grid/list of assets
  - Upload button
  - Delete button per asset
  - Asset preview on tap

---

## Primary Content and Functionality

### Story Reader Flow
1. **User taps "Play" on story card** → Story Reader loads first scene
2. **Background image displays** with character sprite(s) layered
3. **Dialogue text appears** in bottom text box
4. **Voice audio plays** (if available)
5. **User taps screen** → Next dialogue line appears
6. **When choices exist** → Choice buttons replace tap-to-continue
7. **User selects choice** → Transition to new scene (fade/slide)
8. **Loop continues** until story ends or user saves/quits

### Editor Flow
1. **User enters Editor** → Scene list displayed
2. **User taps "Add Scene"** → Scene Editor opens
3. **User fills in scene data** (background, character, dialogue, voice, choices)
4. **User taps "Preview"** → Launches Story Reader for testing
5. **User taps "Save"** → Scene stored in story JSON
6. **User taps "Add Choice"** → Choice Editor opens
7. **User selects target scene** → Choice linked to next scene
8. **User exports story** → JSON file saved to device storage

---

## Key User Flows

### Flow 1: Read a Story (Linear)
```
Home → Select Story → Reader (Scene 1) → Tap → Reader (Scene 2) → ... → Story End
```

### Flow 2: Read a Story (Branching)
```
Home → Select Story → Reader (Scene 1) → Tap → Reader (Scene 2) → Choice Buttons → Select Option A → Reader (Scene 3A) → ...
```

### Flow 3: Save and Load Progress
```
Reader (Scene 5) → Tap Menu → Save → Choose Slot → Reader (Same Scene) → Later: Home → Load → Choose Slot → Reader (Scene 5)
```

### Flow 4: Create New Story
```
Home → Editor → Create New Story → Scene Editor → Fill Scene 1 → Save → Add Scene 2 → Link Choice → Preview → Export
```

### Flow 5: Edit Existing Story
```
Home → Editor → Select Story → Scene List → Tap Scene → Edit Text/Audio/Choices → Save → Preview → Export
```

---

## Color Choices

### Brand Palette (Warm, Inviting, Story-Focused)
- **Primary**: `#8B5CF6` (Purple) — Main accent, choice buttons, highlights
- **Background**: `#0F172A` (Deep Navy) — Dark, immersive reading experience
- **Surface**: `#1E293B` (Slate) — Card backgrounds, text boxes
- **Foreground**: `#F1F5F9` (Off-white) — Primary text, dialogue
- **Muted**: `#94A3B8` (Gray) — Secondary text, timestamps
- **Success**: `#10B981` (Green) — Save confirmation, valid actions
- **Warning**: `#F59E0B` (Amber) — Unsaved changes, deletions
- **Error**: `#EF4444` (Red) — Errors, critical warnings

### Rationale
- Deep navy background reduces eye strain during extended reading
- Purple accent conveys creativity and storytelling
- High contrast ensures text readability on mobile
- Warm tones create emotional connection to narrative

---

## UI/UX Principles

1. **Content-First**: Story and dialogue always take priority in layout
2. **Minimal Distractions**: Hide UI elements when reading; show on tap
3. **One-Handed**: All interactive elements within thumb reach
4. **Responsive**: Adapt to phone (5.5"-6.5") and tablet (7"-12") screens
5. **Accessibility**: Large text, high contrast, haptic feedback
6. **Smooth Transitions**: Fade/slide between scenes (200-300ms)
7. **Intuitive Editing**: Drag-and-drop for scene linking, inline editing

---

## Responsive Design Strategy

### Phone (Portrait)
- Story reader: 60% background, 40% dialogue box
- Choice buttons: Full width, stacked vertically
- Editor: Single-column layout, full-width inputs

### Tablet (Portrait)
- Story reader: 65% background, 35% dialogue box (more breathing room)
- Choice buttons: 2-column grid (if 4+ choices)
- Editor: 2-column layout (preview on right, editor on left)

### Tablet (Landscape)
- Story reader: 70% background (left), 30% dialogue (right)
- Choice buttons: Horizontal layout (side-by-side)
- Editor: Full-width preview + editor side-by-side

---

## Interaction Patterns

### Tap to Continue
- Visual indicator (arrow or "tap to continue" text) at bottom of screen
- Haptic feedback on tap
- Transitions to next dialogue or shows choices

### Choice Selection
- Buttons highlight on hover/press
- Haptic feedback on selection
- Smooth transition to new scene (fade or slide)

### Save/Load
- Quick save: Long-press on reader screen
- Quick load: Menu button → Load → Select slot
- Autosave: Optional, saves every N scenes

### Settings
- Sliders for volume and text speed
- Toggle switches for auto-play and dark mode
- Persistent storage (AsyncStorage)

---

## Performance Considerations

1. **Image Caching**: Pre-load next scene's background while current scene plays
2. **Audio Streaming**: Use lazy loading for voice files
3. **Memory Management**: Unload unused assets when transitioning scenes
4. **List Optimization**: Use FlatList for story/scene lists
5. **Animations**: Keep transitions under 300ms to feel responsive

---

## Accessibility

- **Text Size**: Configurable (small, medium, large)
- **High Contrast**: Dark background + light text by default
- **Haptic Feedback**: Confirm user actions
- **Voice Narration**: Optional text-to-speech for dialogue
- **Screen Reader**: Support for iOS VoiceOver and Android TalkBack

---

## Future Enhancements

- Cloud sync for saves and stories
- Multiplayer story collaboration
- Community story sharing
- Advanced animation system (sprite movement, parallax)
- Custom fonts and themes
- Localization (multi-language support)
