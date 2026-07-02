# Stores Reference

Last updated: 2026-07-02

## Store Ownership

| Concern | Store | Persisted |
|---|---|---|
| Stories, scene records, saves, settings, libraries | `useAppStore` | Yes, through Zustand persist |
| Editor draft state | `useEditorStore` | No |
| Theme/color scheme | `useThemeStore` | Yes |

## useAppStore

- File: `stores/use-app-store.ts`.
- Types: `stores/app-store-types.ts`.
- Initial state: `stores/app-store-initial-state.ts`.
- Slice implementations: `stores/app-store-slices/*`.

### Main State

```typescript
interface AppState {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
  sceneRecordHydration: Record<string, 'full' | 'window'>;
  currentStoryId: string | null;
  playbackState: PlaybackState | null;
  saveSlots: SaveSlot[];
  settings: UserSettings;
  audioLibraries: Record<string, AudioLibraryItem[]>;
  characterLibraries: Record<string, Character[]>;
  mediaLibrary: LibraryAsset[];
  language: Language;
  migrationError: string | null;
}
```

### Main Actions

| Action | Purpose |
|---|---|
| `migrateFromLegacyKeys()` | One-way migration from legacy storage keys |
| `loadCurrentStory(storyId)` | Set current story |
| `createStory(title)` | Create a new canonical story and first scene |
| `deleteStory(storyId)` | Remove story metadata and scene records |
| `hydrateSceneRecordsForStory(storyId)` | Load full scene map for editor/home paths |
| `hydrateReaderSceneWindow(storyId, sceneId, maxPrefetchScenes?)` | Load bounded reader scene window |
| `saveSceneRecord(record)` | Save a canonical scene record |
| `updateSceneRecordPreservingMeta(...)` | Update content while keeping flow metadata |
| `getScenesForStory(storyId)` | Return sorted scene records |
| `updateSceneConnection(...)` / `removeSceneConnection(...)` | Manage scene graph edges |
| `setStartScene(storyId, sceneId)` | Mark story start scene |
| `reorderScenes(storyId, sceneIds)` | Persist scene order |
| `saveGame(slotId)` / `loadGame(slotId)` | Save/load playback state |
| `syncAutoSave(slot)` | Replace autosave slot |
| `updateSettings(partial)` | Update user settings |
| `setAudioLibrary`, `setCharacterLibrary`, `setMediaLibrary` | Replace libraries |
| `setLanguage(lang)` | Change UI language |

## Persistence

`lib/app-store-persistence.ts` owns Zustand `partialize`, `merge`, and version migration.
`lib/app-store-storage.ts` wraps storage and extracts large scene maps into sidecar scene storage.
`lib/scene-record-storage.ts` owns per-story and per-scene scene record storage.

Normal persisted app state excludes runtime-only hydration flags. Scene records remain in memory but are compacted out of the app-state payload after sidecar storage succeeds.

## Selectors

Selector helpers in `stores/use-app-store.ts` delegate scene lookup to `lib/scene-access.ts`.

Reader paths use `lib/reader-scene-cache.ts` to hydrate the current scene plus bounded prefetch scenes. Editor/home paths use full-story hydration when they need the complete scene map.
