# Visual Novel Engine

Cross-platform visual novel editor and reader built with Expo, React Native, TypeScript, Zustand, NativeWind, and Vitest.

The current app uses a canonical scene model: `SceneRecord + TimelineStep`. Editor, preview, reader, story flow, autosave, and manual save/load should prefer this canonical data path. `Story` and `StoryScene` remain compatibility types for import/export and migration boundaries.

## What It Does

- Create and edit visual novel stories.
- Compose scenes with timeline blocks for background, character, text, dialogue, choices, effects, audio, variables, transitions, camera, and interactive objects.
- Preview scenes through the same runtime executor used by reader flows.
- Manage story flow with scene nodes, positions, start scene state, and scene connections.
- Read stories with typewriter text, choices, backgrounds, character sprites, audio, save/load, and autosave.
- Run on web, Android, and iOS through Expo.

## Architecture

- `app/` contains Expo Router screens.
- `components/editor/` contains the active editor UI: `SceneComposer`, `TimelinePanel`, `BlockLibraryPanel`, `PropertiesPanel`, `PreviewScreen`, `StoryFlowScreen`, and related editor surfaces.
- `lib/engine/` contains runtime execution: `useSceneExecutor`, timeline event types, factories, and condition evaluation.
- `stores/use-app-store.ts` owns persisted app state through Zustand.
- `stores/use-editor-store.ts` owns editor draft state.
- `lib/persistent-storage.ts` is the storage abstraction. Do not use AsyncStorage directly in app code.
- `lib/scene-record-adapter.ts` is the compatibility boundary between canonical scene records and legacy story scene shapes.

## Commands

Install dependencies:

```bash
pnpm install
```

Start development:

```bash
pnpm dev
```

Start web development:

```bash
pnpm dev:web
```

Run checks:

```bash
pnpm check
pnpm test
pnpm lint
```

Run native targets:

```bash
pnpm android
pnpm ios
```

## Documentation

- `docs/SCENE-MODEL-CONTRACT.md` documents the canonical scene contract.
- `docs/WEB_DEPLOYMENT.md` documents the web export and GitHub Pages deployment path.
- `docs/research/` contains product research that is still useful as background material.
- `wiki/` is the compact project knowledge base. Historical session logs, old plans, stale reports, and generated tool environments were removed from active documentation.

## Development Rules

- Use Lego as the only editing system.
- Use `useAppStore()` and `useEditorStore()` directly for state. Do not introduce React Context as a state source of truth.
- Keep new scene logic canonical-first: read and write `SceneRecord + TimelineStep`.
- Route compatibility conversions through `lib/scene-record-adapter.ts`.
- Use `createPersistentStorage()` for persistence so web can fall back to `localStorage`.
- Avoid module-level splash-screen side effects on web; run splash setup inside effects with dynamic imports.
- Keep NativeWind `active:` modifiers off `Pressable` unless remapped through `lib/_core/nativewind-pressable.ts`.
