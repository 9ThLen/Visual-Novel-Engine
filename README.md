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
- `components/editor/plate/` contains the active Plate scene editor. `components/editor/` also contains active preview, play, scene management, manuscript, and shared editor surfaces.
- `components/editor-legacy/` contains legacy Lego editor UI for reference only. Active editor screens must not import it.
- `lib/engine/` contains runtime execution: `useSceneExecutor`, timeline event types, factories, and condition evaluation.
- `stores/use-app-store.ts` owns persisted app state through Zustand.
- `stores/use-editor-store.ts` is legacy draft state for isolated compatibility/reference code only. Active scene editor screens use persisted `SceneRecord` data from `useAppStore()`.
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

- `wiki/` is the compact project knowledge base: `wiki/index.md` lists the active pages (`overview.md`, `architecture-reference.md`, `stores-reference.md`, `block-types-reference.md`, and more). Start there.
- `wiki/final-migration-audit.md` tracks the current migration status and cleanup boundaries.
- `PRODUCT.md` describes product purpose, brand, and design principles.
- `DESIGN_SYSTEM.md` documents theme tokens and the color system.
- `AGENTS.md` holds AI-agent rules and project-specific pitfalls.

## Development Rules

- Use Plate as the only scene editing system. Legacy Lego components must not be imported by active editor screens.
- Use `useAppStore()` directly for active app state. Do not introduce React Context as a state source of truth.
- Keep new scene logic canonical-first: read and write `SceneRecord + TimelineStep`.
- Route compatibility conversions through `lib/scene-record-adapter.ts`.
- Use `createPersistentStorage()` for persistence so web can fall back to `localStorage`.
- Avoid module-level splash-screen side effects on web; run splash setup inside effects with dynamic imports.
- Keep NativeWind `active:` modifiers off `Pressable` unless remapped through `lib/_core/nativewind-pressable.ts`.
