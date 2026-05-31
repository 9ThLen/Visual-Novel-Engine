# Project Overview

Visual Novel Engine is a cross-platform visual novel editor and reader for web, Android, and iOS. It is built with Expo, React Native, TypeScript, Zustand, NativeWind, and Vitest.

## What It Does

- **Home screen** — story selection, creation, deletion.
- **Editor** — scene composition with 12 block types, story flow management, preview.
- **Reader** — playback with typewriter text, choices, backgrounds, characters, audio, save/load.
- **Manuscript editor** — structured document-style editing.
- **Settings** — text speed, volume, language, theme.

## Current Product Shape

| Feature | Status |
|---|---|
| Story CRUD | ✅ Complete |
| Scene editor (12 block types) | ✅ Core done, drag-and-drop pending |
| Story flow graph | ✅ Basic |
| Preview screen | ✅ Working (via useSceneExecutor) |
| Reader with executor | ✅ Working |
| Save/Load | ✅ Manual + autosave |
| Audio (BGM + SFX) | ✅ Working |
| Theme (dark/light) | ✅ Working |
| i18n (en/uk) | ✅ Working |
| Import/Export stories | ✅ Working |
| Interactive objects | ⚠️ UI done, runtime no-op |
| Camera effects | ⚠️ UI done, runtime no-op |
| Sound blocks | ⚠️ UI done, runtime no-op |
| Drag-and-drop in timeline | ❌ Not started |
| Flow analysis | ❌ Not started |
| Condition builder UI | ❌ Deferred |

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81.5 + Expo SDK 54 |
| Routing | Expo Router 6 (file-based) |
| State | Zustand 4 (persist middleware) |
| Styling | NativeWind 4 (Tailwind for RN) |
| Animations | Reanimated 4 |
| Storage | AsyncStorage (native) / localStorage (web) |
| Testing | Vitest 2 + Testing Library |
| Types | TypeScript 5.7 (strict) |
| Linting | ESLint 9 + Prettier 3 |

## Project Statistics

| Metric | Value |
|---|---|
| Source files | ~165 .ts/.tsx |
| Source LOC | ~26,115 |
| Test files | 41 |
| Test LOC | ~3,888 |
| Test coverage | ~15% (lib layer), 0% (UI layer) |
| Components | 50 files, ~12,230 LOC |
| Hooks | 16 files, ~1,415 LOC |
| Stores | 4 files, ~1,003 LOC |

## Current Technical Shape

- Canonical scene data is `SceneRecord + TimelineStep`.
- `useSceneExecutor` executes timeline steps for preview and reader flows.
- Zustand stores own app and editor state.
- `createPersistentStorage()` abstracts web and native persistence.
- NativeWind and generated theme variables provide styling.
- Compatibility with old `StoryScene` data is isolated behind adapter code.
- Lego editing system is the primary editor (to be replaced in future).
- Block/Node systems have been removed; only Lego + new TimelineStep system remain.

## Known Issues

- 3 block types (`sound`, `camera`, `interactive_object`) have no-op runtime handlers.
- WSL/NTFS compatibility: test runner requires linux-x64 native binaries for esbuild/rollup.
- Large components need decomposition: `StoryReaderResponsive` (696 LOC), `SceneComposer` (427 LOC).
- No UI component tests exist yet.

## What Is Not Current

- Old Atom/Molecule plans are historical only.
- Old session reports and dated fix plans are not active project docs.
- Python virtual environments, generated logs, build output, and tool lockfiles do not belong in the wiki.

## Source Of Truth

- Project setup: `README.md`
- Scene model: `docs/SCENE-MODEL-CONTRACT.md`
- Runtime executor: `lib/engine/useSceneExecutor.ts`
- App state: `stores/use-app-store.ts`
- Editor state: `stores/use-editor-store.ts`
- Theme tokens: `constants/theme-colors.json`
- Block types: `lib/engine/types.ts`
- Event factories: `lib/engine/event-factory.ts`
