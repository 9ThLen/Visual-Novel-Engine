# Stores Reference

Last updated: 2026-05-29

All stores use **Zustand 4**. State is accessed directly (not via React Context).

## useAppStore

- **File:** `stores/use-app-store.ts` (504 LOC)
- **Purpose:** Global persisted app state.
- **Persisted:** ✅ Yes (via `persist` middleware + `createPersistentStorage()`)
- **Storage key:** `vne_app_state`

### State Shape
```typescript
interface AppState {
  storiesMetadata: StoryMetadata[];           // List of all stories
  scenesByStory: Record<string, Record<string, StoryScene>>;  // Legacy scenes
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;  // Canonical scenes
  currentStoryId: string | null;
  playbackState: PlaybackState | null;
  settings: UserSettings;
  saveSlots: SaveSlot[];
  audioLibraries: Record<string, AudioLibraryItem[]>;
  characterLibraries: Record<string, Character[]>;
  language: Language;
  mediaLibrary: LibraryAsset[];
  isLoaded: boolean;
}
```

### Key Actions

| Action | Purpose |
|---|---|
| `migrateFromLegacyKeys()` | Migrate from old AsyncStorage keys to Zustand persist |
| `loadCurrentStory(storyId)` | Set current story ID |
| `createStory(title)` | Create new story with initial scene |
| `addStory(story)` | Add imported story |
| `deleteStory(storyId)` | Remove story and its scenes |
| `saveSceneRecord(record)` | Save canonical scene record |
| `getScenesForStory(storyId)` | Get sorted scene records for a story |
| `updateSceneConnection(...)` | Add/update scene-to-scene connection |
| `deleteSceneRecord(...)` | Remove scene record |
| `saveGame(slotId)` | Save game to slot |
| `loadGame(slotId)` | Load game from slot |
| `syncAutoSave(slot)` | Update autosave slot |
| `updateSettings(partial)` | Update user settings |
| `setLanguage(lang)` | Change UI language |

### Exported Selectors

```typescript
const selectStoryScenes = (storyId) => (state) => buildCompatibilitySceneMapFromState(state, storyId);
const selectStoryMetadata = (storyId) => (state) => state.storiesMetadata.find(m => m.id === storyId);
const selectCanonicalSceneRecord = (storyId, sceneId) => (state) => getCanonicalSceneRecordFromState(state, storyId, sceneId);
```

### Persisted Fields (partialize)

Everything except `isLoaded` is persisted: storiesMetadata, scenesByStory, sceneRecordsByStory, currentStoryId, playbackState, settings, saveSlots, audioLibraries, characterLibraries, language, mediaLibrary.

## useEditorStore

- **File:** `stores/use-editor-store.ts` (279 LOC)
- **Purpose:** Editor draft state (non-persisted).
- **Persisted:** ❌ No
- **Pattern:** Single store with all actions inline (no separate slice files)

### State Shape
```typescript
interface EditorStore {
  sceneId: string | null;
  sceneName: string;
  timeline: TimelineStep[];
  isDirty: boolean;
  selectedBlockId: string | null;
  viewMode: 'edit' | 'preview' | 'flow';
  showMiniPreview: boolean;
  showBlockLibrary: boolean;
  panelWidths: { left: number; right: number };
  blockSearchQuery: string;
  isSaving: boolean;
  _undoStack: TimelineStep[][];
  _redoStack: TimelineStep[][];
}
```

### Key Actions

| Action | Purpose |
|---|---|
| `setScene(id, name, timeline)` | Load scene into editor |
| `hydrateSceneDraft(draft)` | Hydrate from EditorSceneDraft with dirty check |
| `addBlock(type, index?)` | Create block via event-factory and add to timeline |
| `removeBlock(id)` | Remove block (protected: cannot remove sole background) |
| `updateBlock(id, updates)` | Update block properties |
| `moveBlock(from, to)` | Reorder blocks |
| `duplicateBlock(id)` | Clone block (protected: cannot duplicate background) |
| `toggleBlockCollapsed(id)` | Collapse/expand block in timeline |
| `toggleBlockEnabled(id)` | Enable/disable block execution |
| `selectBlock(id)` | Set selected block |
| `undo()` | Undo last change (max 100 history) |
| `redo()` | Redo last undone change |
| `reset()` | Reset to initial state |

### Exported Selectors

```typescript
const selectSelectedBlock = (state) => TimelineStep | null;
const selectCanUndo = (state) => boolean;
const selectCanRedo = (state) => boolean;
```

## useThemeStore

- **File:** `stores/theme-store.ts` (81 LOC)
- **Purpose:** Color scheme (dark/light).
- **Persisted:** ✅ Yes
- **Storage key:** `vne_theme`

### State Shape
```typescript
interface ThemeState {
  colorScheme: 'dark' | 'light';
  setColorScheme: (scheme) => void;
  applyScheme: (scheme) => void;
}
```

### applyScheme Side Effects
- Calls NativeWind color scheme controller
- Calls `Appearance.setColorScheme()` (native)
- Sets `document.documentElement.dataset.theme` (web)
- Sets CSS custom properties for all color tokens (web)

## useLegoStore

- **File:** `stores/use-lego-store.ts` (139 LOC)
- **Purpose:** Legacy Lego editor state.
- **Persisted:** ❌ No

### State Shape
```typescript
interface LegoStore {
  legoScenes: LegoScene[];
  legoActiveSceneId: string | null;
  // Actions: hydrate, add/remove scene, add/remove element, etc.
}
```

### Key Actions
- `hydrateLegoScenes(data)` — Bulk load scenes
- `addLegoScene(scene)` / `removeLegoScene(id)` — Scene CRUD
- `addLegoElement(id, element)` / `removeLegoElement(id, elementId)` — Element CRUD
- `addLegoTimelineEvent(id, event)` / `removeLegoTimelineEvent(id, eventId)` — Timeline event CRUD
- `batchUpdateLegoTimelineEvents(id, events)` — Replace all events at once
- `batchUpdateLegoElements(id, elements)` — Replace all elements at once

### Exported Selectors
```typescript
const selectLegoScenes = (state) => state.legoScenes;
const selectLegoActiveSceneId = (state) => state.legoActiveSceneId;
const selectLegoSceneById = (id) => (state) => state.legoScenes.find(s => s.id === id) ?? null;
const selectLegoActiveScene = (state) => ...;
const selectLegoSceneIds = (state) => state.legoScenes.map(s => s.id);
const selectLegoSceneCount = (state) => state.legoScenes.length;
```
