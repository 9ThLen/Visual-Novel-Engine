# Hooks Reference

Last updated: 2026-07-01

## Story Store Access

Story state and actions are read directly from `useAppStore`.

- **File:** `stores/use-app-store.ts`
- **Purpose:** Persisted story metadata, scene records, playback state, save slots, settings, libraries, and related actions.
- **Selectors:** Use exported selectors such as `selectStoryMetadata`, `selectCanonicalSceneRecord`, `selectSceneRecordMapForStory`, and `selectSceneRecordsForStory`.
- **Note:** `hooks/use-story-state.ts`, `useStoryState`, and `useStoryActions` were removed. Active code should use `useAppStore()` directly.

## Internationalization Hooks

### useI18n
- **File:** `hooks/use-i18n.ts` (moved from `lib/i18n.ts`)
- **Purpose:** Internationalization hook — reads language directly from Zustand.
- **Signature:** `useI18n() => { language, setLanguage, t, pluralize, languages }`
- **Note:** Moved from `lib/i18n.ts` to resolve layer boundary violation. The original file re-exports for backward compatibility.

## Reader Hooks

### useTypewriter
- **File:** `hooks/useTypewriter.ts` (49 LOC)
- **Purpose:** Typewriter text effect for reader.
- **Signature:** `useTypewriter(textSpeed: number) => { displayedText, isTyping, startTypewriter, completeTypewriter }`
- **Timing:** `charDelayMs = 60 - textSpeed * 48` (speed 0 = 60ms/char, speed 1 = 12ms/char)
- **State:**
  - `displayedText: string` — currently visible text
  - `isTyping: boolean` — whether typewriter is active
- **Methods:**
  - `startTypewriter(text: string)` — begin typing from empty
  - `completeTypewriter()` — instantly show full text
- **Cleanup:** Clears interval on unmount

### useReaderAudio
- **File:** `hooks/useReaderAudio.ts` (277 LOC)
- **Purpose:** Manage audio playback during reader session.
- **Signature:** `useReaderAudio(storyId?, scene?, settings?, options?) => void`
- **Handles:** BGM, voice audio, SFX based on scene audio triggers
- **Options:** `blockedByOverlay` — pauses audio when menu/history is open

### useReaderInitialization
- **File:** `hooks/useReaderInitialization.ts` (144 LOC)
- **Purpose:** Initialize reader state from story/scene IDs.
- **Signature:** `useReaderInitialization(storyId?, options?) => { isLoading, currentScene, sceneRecord, timeline, story, playbackState, updatePlaybackState }`
- **Resolves:** Story from store, current scene record via `selectCanonicalSceneRecord`, timeline from `SceneRecord.timeline`

### useSceneImages
- **File:** `hooks/useSceneImages.ts` (58 LOC)
- **Purpose:** Resolve scene background and character image URIs.
- **Signature:** `useSceneImages(scene: StoryScene) => { bgSource, resolvedCharUris }`
- **Handles:** Bundled assets (expo-asset), URI resolution via `resolveAssetUri`, mounted state guard

## Editor Hooks

### useSceneEditorActions
- **File:** `hooks/useSceneEditorActions.ts` (142 LOC)
- **Purpose:** CRUD operations for scene editor.
- **Signature:** `useSceneEditorActions() => { saveScene, deleteScene, addChoice, deleteChoice, ... }`

### useSceneEditorMedia
- **File:** `hooks/useSceneEditorMedia.ts` (63 LOC)
- **Purpose:** Media-related helpers for editor (image picking, asset resolution).

### useSceneData
- **File:** `hooks/useSceneData.ts` (93 LOC)
- **Purpose:** Resolve scene data from store with fallback logic.

### useAutoSave
- **File:** `hooks/useAutoSave.ts` (64 LOC)
- **Purpose:** Automatically save game state after scene changes.
- **Signature:** `useAutoSave({ playbackState, runtimeSnapshot, onAutoSave, enabled }) => void`
- **Trigger:** 2-second debounce after `currentSceneId` or `isPlaying` changes
- **Mechanism:** Calls `buildCanonicalSaveSlot('autosave', snapshot, state)`

### useResponsiveLayout
- **File:** `hooks/useResponsiveLayout.ts` (43 LOC)
- **Purpose:** Detect device type and compute responsive layout values.
- **Signature:** `useResponsiveLayout(): ResponsiveLayout`
- **Returns:**
  - `deviceType: 'phone' | 'tablet'`
  - `isTablet: boolean`
  - `isLandscape: boolean`
  - `screenWidth`, `screenHeight`
  - `gridColumns`, `sidebarWidth`, `atomMinSize`, `fontSize`, `spacing`
- **Breakpoint:** Tablet when `shortDimension >= 600dp`
- **Implementation:** Uses `useWindowDimensions()` + `getResponsiveValues()` from `lib/responsive.ts`

## Utility Hooks

### useColors
- **File:** `hooks/use-colors.ts` (13 LOC)
- **Purpose:** Get current theme colors from `useThemeStore`.
- **Returns:** `RuntimePalette` with all color tokens (background, surface, foreground, primary, error, etc.)

### useKeyboardShortcuts
- **File:** `hooks/useKeyboardShortcuts.ts` (214 LOC)
- **Purpose:** Register web keyboard shortcuts.
- **Signature:** `useKeyboardShortcuts({ shortcuts })` where shortcuts is `{ [key]: { key, ctrl?, shift?, handler } }`

### useFilePicker
- **File:** `hooks/use-file-picker.ts` (128 LOC)
- **Purpose:** Web file picker for importing stories/assets.

### useSceneManagement
- **File:** `hooks/lego/useSceneManagement.ts` (54 LOC)
- **Purpose:** Legacy Lego scene management.

### useLegoDnD / useLegoTabs
- **Files:** `hooks/lego/useLegoDnD.ts` (34 LOC), `hooks/lego/useLegoTabs.ts` (36 LOC)
- **Purpose:** Lego editor drag-and-drop and tab state.
