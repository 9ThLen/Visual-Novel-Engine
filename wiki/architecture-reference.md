# Architecture Reference

Last updated: 2026-07-02

## Core Contract

The active scene contract is `SceneRecord + TimelineStep`.

- `SceneRecord` owns scene identity, metadata, timeline, graph position, connections, and persisted scene state.
- `TimelineStep` owns executable scene events.
- `Story` and `StoryScene` are legacy compatibility shapes used only for import and storage migration paths.

## Layers

| Layer | Responsibility |
|---|---|
| `app/` | Expo Router screens |
| `components/` | Editor, reader, shared UI, and display components |
| `hooks/` | Reader/editor orchestration, audio, images, layout, keyboard, typewriter |
| `lib/` | Engine, storage, validation, import/export, audio, theme, domain helpers |
| `stores/` | Zustand stores and app-store slices |

## Runtime Flow

1. A screen resolves the active story/scene from `useAppStore`.
2. Scene access helpers read canonical `SceneRecord` data.
3. `useSceneExecutor(timeline)` applies automatic steps and yields on text, dialogue, choice, and transition.
4. Reader and preview consume executor state.
5. Side effects such as audio, images, weather, effects, and interactive objects react to `sceneState`.

## Editor Flow

1. Editor/home paths hydrate a full story scene map with `hydrateSceneRecordsForStory`.
2. Reader paths hydrate a bounded window with `hydrateReaderSceneWindow`.
3. Editor draft state lives in `useEditorStore`.
4. Saves write canonical scene records through `useAppStore`.
5. Story flow edits update canonical graph metadata and connections.

## State Ownership

| Concern | Store | Persisted |
|---|---|---|
| Stories, scene records, saves, settings, libraries | `useAppStore` | Yes |
| Editor draft timeline and selection | `useEditorStore` | No |
| Theme/color scheme | `useThemeStore` | Yes |

## Compatibility Rules

- Keep legacy JSON import and storage migration isolated in `lib/scene-operations.ts`, `lib/story-hooks.ts`, and `stores/use-app-store.ts`.
- Do not duplicate legacy conversion logic in screens or components.
- Do not write new React Context state sources.
- New runtime/editor code should consume canonical `SceneRecord` and `TimelineStep` data directly.

## Key Dependencies

```text
Reader screen
  -> useReaderInitialization
  -> useAppStore scene hydration
  -> useSceneExecutor
  -> useReaderAudio

Editor screen
  -> useAppStore full story hydration
  -> useEditorStore draft state
  -> saveSceneRecord

Persistence
  -> app-store-persistence
  -> app-store-storage
  -> scene-record-storage
```
