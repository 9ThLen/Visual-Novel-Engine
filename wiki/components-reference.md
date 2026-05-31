# Components Reference

Last updated: 2026-05-29

## Editor Components

### SceneComposer
- **File:** `components/editor/SceneComposer.tsx` (427 LOC)
- **Purpose:** Main 3-panel editor layout (desktop) or tab-based layout (phone).
- **Props:** `storyId`, `sceneId`, `initialSceneDraft: EditorSceneDraft`
- **Layout:**
  - Desktop: BlockLibraryPanel (300px) + center canvas (flex) + PropertiesPanel (360px)
  - Phone: Tab-based switching between blocks, timeline, properties, preview, scenes
- **Uses:** `useEditorStore`, `useAppStore`, `useResponsiveLayout`
- **Keyboard shortcuts:** Undo (Ctrl+Z), Redo (Ctrl+Shift+Z), Save (Ctrl+S), Preview (Ctrl+P), Delete (Backspace), Focus Search (Ctrl+A)

### BlockLibraryPanel
- **File:** `components/editor/BlockLibraryPanel.tsx` (263 LOC)
- **Purpose:** Left panel — block picker grouped by category with search.
- **Props:** `onBlockTap: (blockType: BlockType) => void`
- **Features:**
  - 5 categories (Scene, Dialogue, Media, Effects, Logic)
  - Search by label or description
  - Long-press shows tooltip Modal with block details
  - Tap adds block to timeline via `onBlockTap`
- **Internal state:** `query: string`, `tooltip: { info, x, y } | null`

### PropertiesPanel
- **File:** `components/editor/PropertiesPanel.tsx` (273 LOC)
- **Purpose:** Right panel — edit properties of selected block.
- **Props:** `block: TimelineStep`, `onUpdate`, `onDelete`, `onDuplicate`, `onClose`
- **Forms per block type:**
  - Background: asset picker, transition selector, duration input
  - Character: character picker, sprite picker, position buttons, entrance, delay, duration
  - Text: content textarea, anchor selector, typewriter speed
  - Dialogue: dynamic entry list with add/remove speakers
  - Choice: dynamic option list with add/remove (max 20)
  - Effect: effect type, target, intensity, duration
  - Music/Sound: asset picker, action, volume, loop toggle
  - Interactive Object: name, sprite, position (x/y/width/height), toggles
  - Camera: action, zoom level, duration
  - Variable: name, operation (set/add/subtract/multiply/toggle), value
  - Transition: target scene, transition type, duration
- **Validation:** Highlights missing required fields with "REQUIRED" label

### TimelinePanel
- **File:** `components/editor/TimelinePanel.tsx` (431 LOC)
- **Purpose:** Center panel — sortable, reorderable timeline of blocks.
- **Props:** `timeline`, `selectedBlockId`, callbacks for select/add/remove/move/duplicate/toggle

### PreviewScreen
- **File:** `components/editor/PreviewScreen.tsx` (295 LOC)
- **Purpose:** Scene preview using `useSceneExecutor`.
- **Props:** `storyId`, `sceneId`
- **Features:** Typewriter effect, background rendering, character placeholders, choices, music preview, step counter

### SceneManager
- **File:** `components/editor/SceneManager.tsx` (488 LOC)
- **Purpose:** Scene list with CRUD operations, search, and navigation.

### SceneSelector
- **File:** `components/editor/SceneSelector.tsx` (565 LOC)
- **Purpose:** Modal for selecting scenes (import templates, connect scenes).

### StoryFlowScreen
- **File:** `components/editor/StoryFlowScreen.tsx` (584 LOC)
- **Purpose:** Visual story flow graph with scene nodes and connections.

### StoryManuscriptScreen
- **File:** `components/editor/StoryManuscriptScreen.tsx` (226 LOC)
- **Purpose:** Document-style manuscript editing view.

## Reader Components

### StoryReaderResponsive
- **File:** `components/story-reader-responsive.tsx` (696 LOC)
- **Purpose:** Main reader component — full VN playback experience.
- **Props:** `scene?`, `timeline?`, `initialVariables?`, `onContinue?`, `onChoiceSelect?`, `onTransition?`, `routeOnExecutorComplete?`, `isLoading?`, `settings?`, `onHistoryVisibleChange?`
- **Dual mode:** Legacy (scene.text) or Executor (timeline)
- **Features:** Typewriter, auto-play, dialogue history, skip/turbo, splash screen
- **Uses:** `useSceneExecutor`, `useTypewriter`, `useSceneImages`, `useResponsiveLayout`, `enhancedAudioManager`

### DialogueHistory
- **File:** `components/dialogue-history.tsx` (164 LOC)
- **Purpose:** Slide-up history panel showing past dialogue lines.
- **Props:** `visible`, `entries: HistoryEntry[]`, `onClose`
- **Features:** Animated slide, reversed chronological order, opacity fade for older entries

### CharacterDisplay
- **File:** `components/CharacterDisplay.tsx` (37 LOC)
- **Purpose:** Render a character sprite with position and animation props.

### InteractiveObjectsLayer
- **File:** `components/InteractiveObjectsLayer.tsx` (266 LOC)
- **Purpose:** Overlay layer for interactive objects in reader.

### SplashScreen
- **File:** `components/SplashScreen.tsx` (138 LOC)
- **Purpose:** Image/video splash screen with fade in/out.
- **Props:** `splash`, `uiHideTransition?`, `uiShowTransition?`, `onComplete`, `onUIHidden?`, `onUIShown?`

## Shared UI Components

### Button
- **File:** `components/ui/Button.tsx` (263 LOC)
- **Variants:** `primary`, `secondary`, `outline`, `ghost`, `danger`
- **Sizes:** `sm` (36px), `base` (44px), `lg` (52px)
- **Props:** `children`, `onPress`, `variant`, `size`, `disabled`, `loading`, `fullWidth`, `icon`, `iconPosition`, `style`, `textStyle`, `accessibilityLabel`, `accessibilityRole`
- **Animations:** Scale down on press (spring), glow overlay

### ConfirmDialog
- **File:** `components/ui/ConfirmDialog.tsx` (95 LOC)
- **Purpose:** Confirmation modal with OK/Cancel buttons.
- **Props:** `visible`, `title`, `message`, `onConfirm`, `onCancel`, `destructive`

### ScreenContainer
- **File:** `components/screen-container.tsx` (77 LOC)
- **Purpose:** SafeArea wrapper with background color.
- **Props:** `children`, `edges?`, `className?`, `containerClassName?`, `safeAreaClassName?`, `style?`

### ErrorBoundary
- **File:** `components/ErrorBoundary.tsx` (180 LOC)
- **Purpose:** Class component error boundary with retry button.
- **Props:** `children`, `fallback?`
- **Features:** Shows error message, component stack (dev), retry button

## Other Components

### ReaderMenu
- **File:** `components/ReaderMenu.tsx` (114 LOC)
- **Purpose:** Full-screen reader menu overlay.

### DesktopLayout / WebSidebar / WebTopBar
- **Files:** `components/DesktopLayout.tsx` (80), `WebSidebar.tsx` (189), `WebTopBar.tsx` (194)
- **Purpose:** Web-specific layout wrappers for desktop browser.

### ShortcutHint
- **File:** `components/ShortcutHint.tsx` (135 LOC)
- **Purpose:** Keyboard shortcut hint overlay for web.

### LanguageSelector
- **File:** `components/LanguageSelector.tsx` (85 LOC)
- **Purpose:** Language switcher (en/uk).

### ReaderAudioRouteGuard
- **File:** `components/ReaderAudioRouteGuard.tsx` (17 LOC)
- **Purpose:** Stops audio when navigating away from reader.
