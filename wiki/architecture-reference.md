# Architecture Reference

Last updated: 2026-05-29

## Core Contract

The active scene contract is `SceneRecord + TimelineStep`.

- `SceneRecord` stores scene identity, metadata, timeline content, graph position, and connections.
- `TimelineStep` stores executable scene events (12 block types).
- `Story` and `StoryScene` are compatibility shapes, not the normal source of truth.

## Architecture Layers

```
┌──────────────────────────────────────────────────────────┐
│  App Screens (app/) — 17 files, ~2,336 LOC              │
│  Expo Router: tabs, editor, reader, preview, settings   │
├──────────────────────────────────────────────────────────┤
│  Components (components/) — 50 files, ~12,230 LOC       │
│  Editor UI, Reader, Shared UI, Error Boundary           │
├──────────────────────────────────────────────────────────┤
│  Hooks (hooks/) — 16 files, ~1,415 LOC                 │
│  Reader, Editor, Audio, Responsive, Typewriter           │
├──────────────────────────────────────────────────────────┤
│  Domain Logic (lib/) — 76 files, ~8,987 LOC            │
│  Engine, Audio, Storage, Validation, Theme, i18n         │
├──────────────────────────────────────────────────────────┤
│  Stores (stores/) — 4 files, ~1,003 LOC                 │
│  useAppStore, useEditorStore, useThemeStore, useLegoStore│
└──────────────────────────────────────────────────────────┘
```

## Directory Structure

```
app/                          # Expo Router screens
  _layout.tsx                 # Root: ErrorBoundary → ThemeProvider → Stack
  index.tsx                   # Redirect to /tabs
  editor.tsx                  # Scene editor entry
  reader.tsx                  # Story reader
  preview.tsx                 # Scene preview
  tabs/                       # Tab navigation
    _layout.tsx
    index.tsx                 # Home screen

components/
  editor/                     # New editor UI
    SceneComposer.tsx         # Main 3-panel editor (427 LOC)
    TimelinePanel.tsx         # Timeline with drag-and-drop (431 LOC)
    BlockLibraryPanel.tsx     # Block picker by category (263 LOC)
    PropertiesPanel.tsx       # Block property editor (273 LOC)
    PreviewScreen.tsx         # In-editor preview (295 LOC)
    SceneManager.tsx          # Scene list and management (488 LOC)
    SceneSelector.tsx         # Scene picker modal (565 LOC)
    StoryFlowScreen.tsx       # Story flow graph (584 LOC)
    StoryManuscriptScreen.tsx # Manuscript editor (226 LOC)
    modals/                   # Editor modals
    manuscript/               # Manuscript sub-components
  ui/                         # Shared UI primitives
    Button.tsx                # 5 variants × 3 sizes (263 LOC)
    ConfirmDialog.tsx         # Confirmation modal (95 LOC)
  story-reader-responsive.tsx # Main reader component (696 LOC)
  dialogue-history.tsx        # Reader history panel (164 LOC)
  CharacterDisplay.tsx        # Character sprite rendering
  screen-container.tsx        # SafeArea wrapper (77 LOC)
  ErrorBoundary.tsx           # Class component error boundary (180 LOC)
  SplashScreen.tsx            # Image/video splash (138 LOC)

lib/
  engine/                     # Runtime execution
    types.ts                  # All type definitions (367 LOC)
    useSceneExecutor.ts       # Timeline executor hook (289 LOC)
    event-factory.ts          # Block creation factories (220 LOC)
    conditionUtils.ts         # Condition evaluation (59 LOC)
    index.ts                  # Re-exports
  stores/                     # Zustand stores
    use-app-store.ts          # Persisted global state (504 LOC)
    use-editor-store.ts       # Editor draft state (279 LOC)
    theme-store.ts            # Color scheme (81 LOC)
    use-lego-store.ts         # Lego scene state (139 LOC)
  audio-*.ts                  # Audio system (6 files)
  story-*.ts                  # Story domain logic (8 files)
  scene-operations.ts         # SceneRecord CRUD + legacy migration
  *.ts                        # Utilities, validators, services

hooks/
  useTypewriter.ts            # Typewriter text effect (49 LOC)
  useAutoSave.ts              # Auto-save after scene change (64 LOC)
  useReaderAudio.ts           # Reader audio management (277 LOC)
  useReaderInitialization.ts  # Reader state setup (144 LOC)
  useResponsiveLayout.ts      # Device type detection (43 LOC)
  useSceneImages.ts           # Image resolution for reader (58 LOC)
  useSceneEditorActions.ts    # Editor CRUD actions (142 LOC)
  useSceneEditorMedia.ts      # Editor media helpers (63 LOC)
  useKeyboardShortcuts.ts     # Web keyboard shortcuts (214 LOC)
  useFilePicker.ts            # Web file picker (128 LOC)
  useSceneData.ts             # Scene data resolution (93 LOC)

constants/
  theme-colors.json           # 61 OKLCH color tokens
  translations.ts             # en/uk translations
```

## Runtime Flow

1. A screen resolves the active story and scene from `useAppStore`.
2. Canonical scene records provide the timeline (`SceneRecord.timeline: TimelineStep[]`).
3. `useSceneExecutor(timeline)` applies automatic steps and yields on text, dialogue, choice, and transition.
4. Reader and preview consume executor state (`sceneState`, `canAdvance`, `advance()`, `selectChoice()`).
5. Side effects (music, character display) react to `sceneState` changes via `useEffect`.

## Editor Flow

1. The editor opens a story through `useAppStore().getScenesForStory(storyId)`.
2. `SceneComposer` hydrates `useEditorStore` from the canonical scene record.
3. User edits timeline steps through `useEditorStore` (addBlock, removeBlock, updateBlock, moveBlock).
4. Save writes the canonical scene record back via `useAppStore().saveSceneRecord(record)`.
5. Story flow updates graph position, connections, and start scene metadata.

## State Ownership

| Concern | Store | Persisted |
|---|---|---|
| Stories, scenes, saves, settings | `useAppStore` | ✅ Yes (Zustand persist) |
| Editor timeline, selection, view mode | `useEditorStore` | ❌ No |
| Color scheme | `useThemeStore` | ✅ Yes |
| Lego scenes (legacy) | `useLegoStore` | ❌ No |

## Compatibility Rules

- Keep legacy conversion in `lib/scene-record-adapter.ts`.
- Do not duplicate conversion logic in screens or components.
- Do not write new React Context state sources.
- Do not read legacy scene collections before canonical records when canonical data is available.
- Keep import/export and migration code explicit.

## Key Dependencies Between Modules

```
SceneComposer → useEditorStore → useAppStore
                            → resolveSceneRecordForSave()
                            → engine/event-factory.ts

reader.tsx → useReaderInitialization → useAppStore
          → useSceneExecutor → engine/useSceneExecutor.ts
          → useReaderAudio → audio-manager-enhanced.ts
          → useTypewriter → hooks/useTypewriter.ts

PreviewScreen → useEditorStore (for dirty timeline)
             → useSceneExecutor (for playback)
             → AudioPlayerService (for music preview)
```
