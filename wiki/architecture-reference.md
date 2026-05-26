# Architecture Reference

Last updated: 2026-05-26

## Core Contract

The active scene contract is `SceneRecord + TimelineStep`.

- `SceneRecord` stores scene identity, metadata, timeline content, graph position, and connections.
- `TimelineStep` stores executable scene events.
- `Story` and `StoryScene` are compatibility shapes, not the normal source of truth.

## Main Layers

- Routes: `app/` contains Expo Router screens for home, editor, scene editor, story flow, preview, reader, settings, and save/load.
- Editor UI: `components/editor/` contains `SceneComposer`, timeline, properties, preview, story flow, and editor modals.
- Runtime: `lib/engine/` contains `useSceneExecutor`, event factories, engine types, and condition evaluation.
- App state: `stores/use-app-store.ts` owns persisted story metadata, scene records, saves, and app settings.
- Editor draft state: `stores/use-editor-store.ts` owns in-memory editing state.
- Persistence: `lib/persistent-storage.ts` chooses web or native storage.
- Theme: `constants/theme-colors.json`, `lib/theme-variables.ts`, `lib/theme-nativewind.ts`, `theme.config.js`, and `tailwind.config.js`.

## Runtime Flow

1. A screen resolves the active story and scene.
2. Canonical scene records provide the timeline.
3. `useSceneExecutor` applies automatic steps and yields on text, dialogue, choice, and transition.
4. Reader and preview consume the executor state instead of reconstructing their own scene state.
5. Save/load stores runtime snapshots against canonical story and scene ids.

## Editor Flow

1. The editor opens or creates a story through `useAppStore`.
2. The scene editor hydrates a draft from the canonical scene record.
3. `SceneComposer` edits timeline steps through `useEditorStore`.
4. Save writes the canonical scene record back to `useAppStore`.
5. Story flow updates graph position, connections, and start scene metadata.

## Compatibility Rules

- Keep legacy conversion in `lib/scene-record-adapter.ts`.
- Do not duplicate conversion logic in screens or components.
- Do not write new React Context state sources.
- Do not read legacy scene collections before canonical records when canonical data is available.
- Keep import/export and migration code explicit.
