# Project Overview

Visual Novel Engine is a cross-platform visual novel editor and reader for web, Android, and iOS. It is built with Expo, React Native, TypeScript, Zustand, NativeWind, and Vitest.

## Current Product Shape

- Home screen for story selection and initialization.
- Editor flow for scene composition, story flow, preview, manuscript editing, and save/load.
- Reader flow for playback with text, dialogue, choices, backgrounds, characters, audio, and persistence.
- Bundled demo story and sample media assets for local development.

## Current Technical Shape

- Canonical scene data is `SceneRecord + TimelineStep`.
- `useSceneExecutor` executes timeline steps for preview and reader flows.
- Zustand stores own app and editor state.
- `createPersistentStorage()` abstracts web and native persistence.
- NativeWind and generated theme variables provide styling.
- Compatibility with old `StoryScene` data is isolated behind adapter code.

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
