# Project Overview

Visual Novel Engine is a cross-platform visual novel editor and reader for web, Android, and iOS. It uses Expo, React Native, TypeScript, Zustand, NativeWind, and Vitest.

## Current Product Shape

| Feature | Status |
|---|---|
| Story CRUD | Complete |
| Scene/document editor | Active Plate/document flow |
| Manuscript editor | Working |
| Scene manager | Working |
| Preview screen | Working through `useSceneExecutor` |
| Reader | Working with lazy scene window hydration |
| Save/load | Manual saves plus autosave |
| Audio | BGM and SFX covered by runtime tests |
| Theme and i18n | Working |
| Import/export | Working with canonical and legacy JSON inputs |

## Technical Shape

- Canonical scene data is `SceneRecord + TimelineStep`.
- `useSceneExecutor` runs reader and preview timelines.
- `useAppStore()` is the app state entrypoint; the implementation is split into slices.
- Scene records persist through the app-store persistence layer and per-story scene storage.
- Reader code uses scene access/cache helpers instead of keeping every story scene hot in memory.
- Legacy `Story`, `StoryScene`, and `Choice` remain only for JSON import and old storage migration.
- Component coverage exists for reader controls/display, error boundary, and autosave paths.

## Known Issues

- Some advanced runtime effects still need deeper product validation.
- Native runtime verification remains blocked on this Windows machine without Android SDK/emulator setup.
- Old dated reports in `wiki/` are historical snapshots and may describe removed code.

## Source Of Truth

- Setup: `README.md`
- Current architecture: `wiki/architecture-reference.md`
- Store shape: `wiki/stores-reference.md`
- Testing: `wiki/testing-guide.md`
- Scene model: `lib/engine/types.ts`
- Runtime executor: `lib/engine/useSceneExecutor.ts`
- App state: `stores/use-app-store.ts`
